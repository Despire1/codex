import {
  Children,
  PropsWithChildren,
  ReactElement,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Location = {
  pathname: string;
  search: string;
  state: unknown;
};

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

type RouteProps = {
  path: string;
  element: ReactNode;
};

type RouteParams = Record<string, string>;

export type BlockNavigationTx = {
  retry: () => void;
};

type BlockNavigationHandler = (tx: BlockNavigationTx) => void;

type RouterContextValue = {
  location: Location;
  navigate: (to: string, options?: NavigateOptions) => void;
  block: (handler: BlockNavigationHandler) => () => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);
const RouteParamsContext = createContext<RouteParams>({});

const normalizePath = (path: string) => {
  if (!path) return '/';
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  if (withLeading.length > 1 && withLeading.endsWith('/')) {
    return withLeading.slice(0, -1);
  }
  return withLeading;
};

const splitPathSegments = (path: string) => normalizePath(path).split('/').filter(Boolean);

const safeDecodeParam = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const matchPath = (routePath: string, currentPath: string): { params: RouteParams } | null => {
  const normalizedRoute = normalizePath(routePath);
  const normalizedCurrent = normalizePath(currentPath);

  if (normalizedRoute === '*' || normalizedRoute === '/*') return { params: {} };

  const hasWildcardTail = normalizedRoute.endsWith('/*');
  const routeForMatching = hasWildcardTail ? normalizedRoute.slice(0, -2) || '/' : normalizedRoute;
  const routeSegments = splitPathSegments(routeForMatching);
  const currentSegments = splitPathSegments(normalizedCurrent);

  if (!hasWildcardTail && routeSegments.length !== currentSegments.length) return null;
  if (hasWildcardTail && currentSegments.length < routeSegments.length) return null;

  const params: RouteParams = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const currentSegment = currentSegments[index];
    if (currentSegment === undefined) return null;

    if (routeSegment.startsWith(':')) {
      const key = routeSegment.slice(1);
      if (!key) return null;
      params[key] = safeDecodeParam(currentSegment);
      continue;
    }

    if (routeSegment !== currentSegment) return null;
  }

  return { params };
};

export const BrowserRouter = ({ children }: PropsWithChildren) => {
  const [location, setLocation] = useState<Location>(() => ({
    pathname: normalizePath(window.location.pathname),
    search: window.location.search,
    state: window.history.state ?? null,
  }));
  const locationRef = useRef(location);
  const blockerRef = useRef<BlockNavigationHandler | null>(null);
  const allowNextPopRef = useRef(false);

  const updateLocation = useCallback((nextLocation: Location) => {
    locationRef.current = nextLocation;
    setLocation(nextLocation);
  }, []);

  const commitNavigation = useCallback(
    (
      nextLocation: Location,
      options?: {
        replace?: boolean;
      },
    ) => {
      const target = `${nextLocation.pathname}${nextLocation.search}`;
      if (options?.replace) {
        window.history.replaceState(nextLocation.state, '', target);
      } else {
        window.history.pushState(nextLocation.state, '', target);
      }
      updateLocation(nextLocation);
    },
    [updateLocation],
  );

  const navigate = useCallback((to: string, options?: NavigateOptions) => {
    const url = new URL(to, window.location.origin);
    const targetPathname = normalizePath(url.pathname);
    const targetSearch = url.search;
    const nextState = options?.state ?? null;
    const nextLocation = {
      pathname: targetPathname,
      search: targetSearch,
      state: nextState,
    };
    const blocker = blockerRef.current;
    if (!blocker) {
      commitNavigation(nextLocation, options);
      return;
    }
    blocker({
      retry: () => {
        commitNavigation(nextLocation, options);
      },
    });
  }, [commitNavigation]);

  const block = useCallback((handler: BlockNavigationHandler) => {
    blockerRef.current = handler;
    return () => {
      if (blockerRef.current === handler) {
        blockerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const nextLocation = {
        pathname: normalizePath(window.location.pathname),
        search: window.location.search,
        state: event.state ?? null,
      };

      if (allowNextPopRef.current) {
        allowNextPopRef.current = false;
        updateLocation(nextLocation);
        return;
      }

      const blocker = blockerRef.current;
      if (!blocker) {
        updateLocation(nextLocation);
        return;
      }

      const currentLocation = locationRef.current;
      window.history.pushState(
        currentLocation.state ?? null,
        '',
        `${currentLocation.pathname}${currentLocation.search}`,
      );
      blocker({
        retry: () => {
          allowNextPopRef.current = true;
          window.history.back();
        },
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [updateLocation]);

  const value = useMemo<RouterContextValue>(() => ({ location, navigate, block }), [block, location, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

const useRouterContext = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('Router components must be used within a BrowserRouter');
  }
  return context;
};

export const useLocation = () => useRouterContext().location;

export const useNavigate = () => useRouterContext().navigate;

export const useBlockNavigation = () => useRouterContext().block;

export const useParams = <T extends Record<string, string | undefined> = Record<string, string | undefined>>() =>
  useContext(RouteParamsContext) as T;

export const Route = (_: RouteProps) => null;

export const Routes = ({ children }: PropsWithChildren) => {
  const { location } = useRouterContext();
  const routes = Children.toArray(children) as ReactElement<RouteProps>[];
  const match = routes
    .map((route) => ({ route, matched: matchPath(route.props.path, location.pathname) }))
    .find((entry) => entry.matched !== null);

  if (!match) return null;

  return (
    <RouteParamsContext.Provider value={match.matched?.params ?? {}}>
      {match.route.props.element}
    </RouteParamsContext.Provider>
  );
};

export const Navigate = ({ to, replace = true }: { to: string; replace?: boolean }) => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
};
