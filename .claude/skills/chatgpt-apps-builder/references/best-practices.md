# ChatGPT Apps: Best Practices & Patterns

Collection of proven patterns, best practices, and common pitfalls when building ChatGPT Apps with the OpenAI Apps SDK.

## Data Architecture

### Structuring Tool Responses

**Pattern: Three-tier data model**

```typescript
return {
  // Tier 1: Model narration (< 200 tokens ideal)
  content: [
    { type: "text", text: `Found ${results.length} restaurants in ${location}` }
  ],
  
  // Tier 2: Model-readable structured data (< 4k tokens)
  structuredContent: {
    count: results.length,
    query: { location, cuisine },
    topResults: results.slice(0, 5).map(r => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      priceRange: r.priceRange
    }))
  },
  
  // Tier 3: Widget-only full dataset
  _meta: {
    allResults: results, // Full data for widget
    facets: computeFacets(results),
    timestamp: new Date().toISOString(),
    debug: { executionTime: "42ms" }
  }
};
```

**Why this works:**
- Model gets concise summary for reasoning
- Widget gets full data for rich UI
- Performance stays good (< 4k tokens in model's view)

### Pagination Strategy

**Server-side pagination:**

```typescript
server.registerTool(
  "search_restaurants",
  {
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 }
      }
    },
    _meta: {
      "openai/widgetAccessible": true,
      "openai/outputTemplate": "ui://widget/list.html"
    }
  },
  async ({ location, page = 1, pageSize = 20 }) => {
    const offset = (page - 1) * pageSize;
    const results = await db.search(location, { offset, limit: pageSize });
    const total = await db.count(location);
    
    return {
      structuredContent: {
        page,
        pageSize,
        total,
        hasMore: offset + pageSize < total,
        results: results.slice(0, 5) // Summary for model
      },
      _meta: {
        allResults: results, // Full page for widget
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    };
  }
);
```

**Widget pagination controls:**

```typescript
function RestaurantList() {
  const toolOutput = useOpenAiGlobal("toolOutput");
  const pagination = toolOutput?.structuredContent?.pagination;
  
  const loadPage = async (page: number) => {
    await window.openai.callTool("search_restaurants", {
      location: toolOutput.query.location,
      page,
      pageSize: 20
    });
  };
  
  return (
    <div>
      {/* Results */}
      <Pagination 
        current={pagination.page}
        total={pagination.totalPages}
        onPageChange={loadPage}
      />
    </div>
  );
}
```

### Filtering & Sorting

**Pattern: Keep filters in widget state**

```typescript
// Widget maintains filter state
const [filters, setFilters] = useWidgetState({
  priceRange: "all",
  rating: 0,
  cuisine: "all"
});

// Filter results client-side when dataset is small
const filteredResults = useMemo(() => {
  let results = toolOutput?._meta?.allResults ?? [];
  
  if (filters.priceRange !== "all") {
    results = results.filter(r => r.priceRange === filters.priceRange);
  }
  
  if (filters.rating > 0) {
    results = results.filter(r => r.rating >= filters.rating);
  }
  
  return results;
}, [toolOutput, filters]);

// Or call server for complex filtering
const applyFilters = async () => {
  await window.openai.callTool("search_restaurants", {
    location: toolOutput.query.location,
    filters
  });
};
```

**When to filter client-side vs server-side:**
- Client-side: < 100 items, simple filters, instant UX
- Server-side: > 100 items, complex logic, database indexes

## State Management

### Widget State Patterns

**Pattern: Minimal serializable state**

```typescript
// ✅ Good: Small, serializable state
const [state, setState] = useWidgetState({
  selectedId: "restaurant-123",
  viewMode: "list",
  page: 2,
  sortBy: "rating"
});

// ❌ Bad: Large or non-serializable state
const [state, setState] = useWidgetState({
  selectedRestaurant: { /* full object */ }, // Too large
  allData: [...], // Duplicate of toolOutput
  callbacks: { onClick: () => {} }, // Not serializable
});
```

**Pattern: Derived state from toolOutput**

```typescript
// Don't store what can be computed
const selectedRestaurant = useMemo(() => {
  const id = widgetState?.selectedId;
  return toolOutput?._meta?.allResults?.find(r => r.id === id);
}, [widgetState?.selectedId, toolOutput]);
```

### Multi-step Wizards

**Pattern: Wizard state machine**

```typescript
type WizardState = {
  step: "select" | "configure" | "confirm" | "complete";
  selection?: string;
  options?: Record<string, any>;
};

function BookingWizard() {
  const [wizard, setWizard] = useWidgetState<WizardState>({
    step: "select"
  });
  
  const nextStep = async () => {
    switch (wizard.step) {
      case "select":
        setWizard({ ...wizard, step: "configure" });
        break;
      case "configure":
        setWizard({ ...wizard, step: "confirm" });
        break;
      case "confirm":
        // Submit booking
        await window.openai.callTool("create_booking", {
          restaurantId: wizard.selection,
          options: wizard.options
        });
        setWizard({ ...wizard, step: "complete" });
        break;
    }
  };
  
  return <WizardStep step={wizard.step} onNext={nextStep} />;
}
```

## UI Patterns

### Loading States

**Pattern: Progressive disclosure**

```typescript
function RestaurantList() {
  const toolOutput = useOpenAiGlobal("toolOutput");
  const [loading, setLoading] = useState(false);
  
  const handleRefresh = async () => {
    setLoading(true);
    try {
      await window.openai.callTool("search_restaurants", {
        location: toolOutput.query.location
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Show skeleton while waiting for initial data
  if (!toolOutput) {
    return <Skeleton />;
  }
  
  return (
    <div>
      <button onClick={handleRefresh} disabled={loading}>
        {loading ? <Spinner /> : "Refresh"}
      </button>
      {/* Results */}
    </div>
  );
}
```

### Error Handling

**Pattern: User-friendly error boundaries**

```typescript
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setError(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);
  
  if (error) {
    return (
      <div className="error-state">
        <h3>Something went wrong</h3>
        <p>{error.message}</p>
        <button onClick={() => setError(null)}>Try again</button>
      </div>
    );
  }
  
  return <>{children}</>;
}
```

### Empty States

**Pattern: Helpful empty states**

```typescript
function RestaurantList() {
  const restaurants = toolOutput?._meta?.allResults ?? [];
  
  if (restaurants.length === 0) {
    return (
      <div className="empty-state">
        <EmptyIcon />
        <h3>No restaurants found</h3>
        <p>Try adjusting your search criteria</p>
        <button onClick={handleSearchAgain}>Search Again</button>
      </div>
    );
  }
  
  return <>{/* Results */}</>;
}
```

### Responsive Design

**Pattern: Mobile-first with breakpoints**

```css
/* Mobile first */
.restaurant-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* Tablet */
@media (min-width: 768px) {
  .restaurant-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .restaurant-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

**Pattern: Adapt to display mode**

```typescript
function RestaurantMap() {
  const displayMode = useOpenAiGlobal("displayMode");
  const maxHeight = useOpenAiGlobal("maxHeight");
  
  const mapHeight = displayMode === "fullscreen" 
    ? "100vh" 
    : displayMode === "pip"
    ? "400px"
    : Math.min(maxHeight * 0.8, 600);
  
  return <div style={{ height: mapHeight }}>{/* Map */}</div>;
}
```

## Performance Optimization

### Bundle Size

**Pattern: Code splitting**

```typescript
import { lazy, Suspense } from "react";

// Lazy load heavy components
const RestaurantMap = lazy(() => import("./RestaurantMap"));
const RestaurantChart = lazy(() => import("./RestaurantChart"));

function App() {
  const [view, setView] = useWidgetState({ view: "list" });
  
  return (
    <Suspense fallback={<Spinner />}>
      {view === "map" && <RestaurantMap />}
      {view === "chart" && <RestaurantChart />}
      {view === "list" && <RestaurantList />}
    </Suspense>
  );
}
```

**Pattern: Dynamic imports for libraries**

```typescript
// Only load Mapbox when needed
async function initializeMap() {
  const mapboxgl = await import("mapbox-gl");
  const map = new mapboxgl.Map({ /* ... */ });
  return map;
}
```

### Image Optimization

**Pattern: Responsive images**

```typescript
function RestaurantImage({ restaurant }: { restaurant: Restaurant }) {
  // Serve appropriate size based on container
  const imageUrl = useMemo(() => {
    const width = containerWidth < 400 ? 400 : 800;
    return `${restaurant.imageUrl}?w=${width}&q=80`;
  }, [restaurant.imageUrl, containerWidth]);
  
  return (
    <img 
      src={imageUrl}
      alt={restaurant.name}
      loading="lazy"
      decoding="async"
    />
  );
}
```

### Debouncing & Throttling

**Pattern: Debounce search input**

```typescript
import { useDebouncedCallback } from "use-debounce";

function SearchInput() {
  const [query, setQuery] = useState("");
  
  const search = useDebouncedCallback(async (q: string) => {
    if (q.length < 3) return;
    await window.openai.callTool("search_restaurants", {
      query: q
    });
  }, 500);
  
  return (
    <input 
      value={query}
      onChange={(e) => {
        setQuery(e.target.value);
        search(e.target.value);
      }}
    />
  );
}
```

**Pattern: Throttle scroll events**

```typescript
import { useThrottledCallback } from "use-debounce";

function InfiniteScroll() {
  const handleScroll = useThrottledCallback(() => {
    if (isNearBottom() && hasMore) {
      loadNextPage();
    }
  }, 200);
  
  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);
}
```

## Security Patterns

### Input Validation

**Pattern: Sanitize user input**

```typescript
import DOMPurify from "dompurify";

function RestaurantReview({ review }: { review: Review }) {
  // Sanitize HTML content
  const cleanHtml = useMemo(
    () => DOMPurify.sanitize(review.content),
    [review.content]
  );
  
  return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
}
```

**Pattern: Validate server data**

```typescript
import { z } from "zod";

const RestaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  rating: z.number().min(0).max(5),
  imageUrl: z.string().url().optional()
});

function useRestaurants() {
  const toolOutput = useOpenAiGlobal("toolOutput");
  
  const validated = useMemo(() => {
    const raw = toolOutput?._meta?.allResults ?? [];
    return raw
      .map(r => RestaurantSchema.safeParse(r))
      .filter(result => result.success)
      .map(result => result.data);
  }, [toolOutput]);
  
  return validated;
}
```

### XSS Prevention

**Pattern: Use text content over innerHTML**

```typescript
// ✅ Good: Safe text rendering
function RestaurantName({ name }: { name: string }) {
  return <h3>{name}</h3>;
}

// ❌ Bad: Potential XSS
function RestaurantName({ name }: { name: string }) {
  return <h3 dangerouslySetInnerHTML={{ __html: name }} />;
}
```

### CSP Configuration

**Pattern: Minimal CSP allowlist**

```typescript
// ✅ Good: Specific domains only
"openai/widgetCSP": {
  connect_domains: [
    "https://api.yourservice.com",
    "https://analytics.yourservice.com"
  ],
  resource_domains: [
    "https://cdn.yourservice.com"
  ]
}

// ❌ Bad: Wildcards allow too much
"openai/widgetCSP": {
  connect_domains: ["https://*.example.com"],
  resource_domains: ["https://*"]
}
```

## Testing Strategies

### Unit Testing

**Pattern: Test hooks independently**

```typescript
import { renderHook, act } from "@testing-library/react";

test("useWidgetState persists state", () => {
  const { result } = renderHook(() => useWidgetState({ count: 0 }));
  
  act(() => {
    result.current[1]({ count: 5 });
  });
  
  expect(result.current[0].count).toBe(5);
  expect(window.openai.setWidgetState).toHaveBeenCalledWith({ count: 5 });
});
```

### Integration Testing

**Pattern: Mock window.openai**

```typescript
beforeEach(() => {
  global.window.openai = {
    toolOutput: { restaurants: mockRestaurants },
    toolInput: { location: "Paris" },
    toolResponseMetadata: {},
    widgetState: null,
    setWidgetState: jest.fn(),
    callTool: jest.fn(),
    theme: "light",
    locale: "en-US",
    // ... other properties
  };
});

test("renders restaurants from toolOutput", () => {
  render(<RestaurantList />);
  expect(screen.getByText("Restaurant 1")).toBeInTheDocument();
});
```

### E2E Testing

**Pattern: Test with MCP Inspector**

1. Start MCP server: `npm run dev`
2. Open MCP Inspector: `npx @modelcontextprotocol/inspector`
3. Connect to server: `http://localhost:3000/mcp`
4. Manual testing checklist:
   - ✅ Widget renders correctly
   - ✅ Theme switching works (light/dark)
   - ✅ Tool calls update widget
   - ✅ Widget state persists across tool calls
   - ✅ Error states display properly
   - ✅ Mobile responsive design
   - ✅ Display mode changes (inline/PiP/fullscreen)

## Common Pitfalls

### Pitfall 1: Large structuredContent

**Problem:** Sending huge objects to model degrades performance

```typescript
// ❌ Bad: 10MB of data sent to model
return {
  structuredContent: {
    allRestaurants: [...] // 1000+ items
  }
};
```

**Solution:** Keep it concise, move bulk to `_meta`

```typescript
// ✅ Good: Summary for model, bulk for widget
return {
  structuredContent: {
    count: 1000,
    topResults: restaurants.slice(0, 5)
  },
  _meta: {
    allRestaurants: restaurants
  }
};
```

### Pitfall 2: Storing Functions in Widget State

**Problem:** Non-serializable state causes errors

```typescript
// ❌ Bad: Functions don't serialize
setWidgetState({
  onClick: () => handleClick(),
  data: new Map([...])
});
```

**Solution:** Store only serializable data

```typescript
// ✅ Good: Plain objects only
setWidgetState({
  selectedId: "123",
  filters: { cuisine: "Italian" }
});
```

### Pitfall 3: Ignoring Loading States

**Problem:** Poor UX during async operations

```typescript
// ❌ Bad: No loading indicator
async function refresh() {
  await window.openai.callTool("search", {});
  // User sees nothing happening
}
```

**Solution:** Show loading state

```typescript
// ✅ Good: Clear feedback
const [loading, setLoading] = useState(false);

async function refresh() {
  setLoading(true);
  try {
    await window.openai.callTool("search", {});
  } finally {
    setLoading(false);
  }
}

return loading ? <Spinner /> : <Results />;
```

### Pitfall 4: Not Handling Errors

**Problem:** Unhandled errors crash widget

```typescript
// ❌ Bad: No error handling
async function loadData() {
  await window.openai.callTool("fetch_data", {});
}
```

**Solution:** Catch and display errors

```typescript
// ✅ Good: Graceful error handling
const [error, setError] = useState<Error | null>(null);

async function loadData() {
  try {
    setError(null);
    await window.openai.callTool("fetch_data", {});
  } catch (err) {
    setError(err);
    console.error("Failed to load data:", err);
  }
}

if (error) {
  return <ErrorDisplay error={error} onRetry={loadData} />;
}
```

### Pitfall 5: CSP Violations

**Problem:** External resources blocked by CSP

```typescript
// ❌ Bad: Loading from non-allowlisted domain
<img src="https://external-cdn.com/image.jpg" />
// Console: "Refused to load image due to CSP"
```

**Solution:** Add domain to CSP configuration

```typescript
// ✅ Good: Domain in widgetCSP
"openai/widgetCSP": {
  resource_domains: ["https://external-cdn.com"]
}
```

### Pitfall 6: Inline Scripts/Styles

**Problem:** CSP blocks inline scripts and styles

```html
<!-- ❌ Bad: Inline script blocked -->
<script>
  console.log("Hello");
</script>
```

**Solution:** Bundle all code and styles

```html
<!-- ✅ Good: Bundled files -->
<script type="module" src="app.js"></script>
<style>/* bundled CSS */</style>
```

## Deployment Checklist

### Pre-deployment

- [ ] Bundle size < 500KB
- [ ] All external domains in CSP allowlist
- [ ] No inline scripts/styles
- [ ] Error boundaries implemented
- [ ] Loading states for all async operations
- [ ] Mobile responsive design tested
- [ ] Light/dark theme support
- [ ] Input validation and sanitization
- [ ] HTTPS endpoint configured
- [ ] OAuth metadata endpoints tested
- [ ] Token verification logic correct
- [ ] Redirect URIs allowlisted

### Testing

- [ ] MCP Inspector testing complete
- [ ] All tools callable and return valid data
- [ ] Widgets render correctly in all display modes
- [ ] State persists across tool calls
- [ ] File upload/download works (if applicable)
- [ ] Authentication flow completes (if applicable)
- [ ] Error cases handled gracefully
- [ ] Performance acceptable (< 3s load time)

### Monitoring

- [ ] Error tracking configured (Sentry, etc.)
- [ ] Analytics implemented (if needed)
- [ ] Logging redacts PII
- [ ] Correlation IDs for debugging
- [ ] Alerts for failed auth attempts
- [ ] Token expiration monitoring

### Documentation

- [ ] Tool descriptions clear and accurate
- [ ] Required scopes documented
- [ ] CSP domains justified
- [ ] Privacy policy published
- [ ] Support contact available
- [ ] Changelog maintained

## Resources

**Example Code:**
- [OpenAI Apps SDK Examples](https://github.com/openai/openai-apps-sdk-examples)
- [Pizzaz Components](https://developers.openai.com/apps-sdk/build/examples)

**Libraries:**
- [Apps SDK UI Kit](https://openai.github.io/apps-sdk-ui)
- [React Hook Form](https://react-hook-form.com/)
- [Zod](https://zod.dev/)
- [DOMPurify](https://github.com/cure53/DOMPurify)

**Tools:**
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [Bundle Analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
