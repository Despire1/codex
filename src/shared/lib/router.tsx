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
};

type NavigateOptions = {
  replace?: boolean;
};

type RouteProps = {
  path: string;
  element: ReactNode;
};

type RouterContextValue = {
  location: Location;
  navigate: (to: string, options?: NavigateOptions) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

const normalizePath = (path: string) => {
  if (!path) return '/';
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  if (withLeading.length > 1 && withLeading.endsWith('/')) {
    return withLeading.slice(0, -1);
  }
  return withLeading;
};

const matchPath = (routePath: string, currentPath: string) => {
  const normalizedRoute = normalizePath(routePath);
  const normalizedCurrent = normalizePath(currentPath);

  if (normalizedRoute === '*' || normalizedRoute === '/*') return true;
  if (normalizedRoute.endsWith('/*')) {
    const base = normalizedRoute.slice(0, -2);
    return normalizedCurrent === base || normalizedCurrent.startsWith(`${base}/`);
  }

  return normalizedRoute === normalizedCurrent;
};

export const BrowserRouter = ({ children }: PropsWithChildren) => {
  const [location, setLocation] = useState<Location>(() => ({ pathname: normalizePath(window.location.pathname) }));

  const navigate = useCallback((to: string, options?: NavigateOptions) => {
    const target = normalizePath(to);
    if (options?.replace) {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
    setLocation({ pathname: target });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setLocation({ pathname: normalizePath(window.location.pathname) });
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

export const Route = (_: RouteProps) => null;

export const Routes = ({ children }: PropsWithChildren) => {
  const { location } = useRouterContext();
  const routes = Children.toArray(children) as ReactElement<RouteProps>[];
  const match = routes.find((route) => matchPath(route.props.path, location.pathname));

  if (!match) return null;

  return <>{match.props.element}</>;
};

export const Navigate = ({ to, replace = true }: { to: string; replace?: boolean }) => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
};
