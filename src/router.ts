/**
 * Simple HTTP Router for handling requests
 */

type RouteHandler = (request: Request, params: RouteParams) => Promise<Response> | Response;

export interface RouteParams {
  /** The matched pathname */
  pathname: string;
  /** Response headers */
  headers: Headers;
  /** Dynamic route parameters (e.g., :filename becomes params.filename) */
  [key: string]: string | Headers;
}

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
}

/**
 * HTTP Router class for organizing request handling
 */
export class Router {
  private routes: Route[] = [];
  private notFoundHandler: RouteHandler = () => new Response("Not found", { status: 404 });

  /**
   * Add a route handler
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - URL path pattern (supports :param syntax)
   * @param handler - Route handler function
   */
  addRoute(method: string, path: string, handler: RouteHandler): this {
    const paramNames: string[] = [];
    const paramPlaceholders: string[] = [];

    // Convert path pattern to regex, extracting param names
    // Use a placeholder to protect param groups from escaping
    let pattern = path.replace(/:([^/]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      const placeholder = `__PARAM_${paramNames.length - 1}__`;
      paramPlaceholders.push("([^/]+)");
      return placeholder;
    });

    // Escape special regex chars
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Restore param groups (un-escape them)
    paramPlaceholders.forEach((paramPattern, index) => {
      pattern = pattern.replace(`__PARAM_${index}__`, paramPattern);
    });

    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${pattern}$`),
      handler,
      paramNames,
    });

    return this;
  }

  /**
   * Add GET route
   */
  get(path: string, handler: RouteHandler): this {
    return this.addRoute("GET", path, handler);
  }

  /**
   * Add POST route
   */
  post(path: string, handler: RouteHandler): this {
    return this.addRoute("POST", path, handler);
  }

  /**
   * Add OPTIONS route
   */
  options(path: string, handler: RouteHandler): this {
    return this.addRoute("OPTIONS", path, handler);
  }

  /**
   * Set handler for unmatched routes
   */
  setNotFoundHandler(handler: RouteHandler): this {
    this.notFoundHandler = handler;
    return this;
  }

  /**
   * Handle an incoming request
   * @param request - The HTTP request
   * @param baseHeaders - Base headers to include in params
   * @param pathPrefix - Optional path prefix to strip
   */
  async handle(
    request: Request,
    baseHeaders: Headers,
    pathPrefix: string = "/"
  ): Promise<Response> {
    const url = new URL(request.url);
    let pathname = url.pathname;

    // Strip path prefix if present
    if (pathPrefix !== "/" && pathname.startsWith(pathPrefix)) {
      pathname = pathname.slice(pathPrefix.length) || "/";
    }

    const method = request.method.toUpperCase();

    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = pathname.match(route.pattern);
      if (match) {
        // Extract params from match groups
        const params: RouteParams = {
          pathname,
          headers: baseHeaders,
        };

        route.paramNames.forEach((name, index) => {
          const value = match[index + 1] || "";
          params[name] = decodeURIComponent(value);
        });

        return route.handler(request, params);
      }
    }

    // No route matched
    return this.notFoundHandler(request, { pathname, headers: baseHeaders });
  }
}

/**
 * Create CORS headers for responses
 */
export function createCorsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}
