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

type RouterContextValue = {
  location: Location;
  navigate: (to: string, options?: NavigateOptions) => void;
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

  const navigate = useCallback((to: string, options?: NavigateOptions) => {
    const url = new URL(to, window.location.origin);
    const targetPathname = normalizePath(url.pathname);
    const targetSearch = url.search;
    const target = `${targetPathname}${targetSearch}`;
    const nextState = options?.state ?? null;
    if (options?.replace) {
      window.history.replaceState(nextState, '', target);
    } else {
      window.history.pushState(nextState, '', target);
    }
    setLocation({ pathname: targetPathname, search: targetSearch, state: nextState });
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setLocation({
        pathname: normalizePath(window.location.pathname),
        search: window.location.search,
        state: event.state ?? null,
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const value = useMemo<RouterContextValue>(() => ({ location, navigate }), [location, navigate]);

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
