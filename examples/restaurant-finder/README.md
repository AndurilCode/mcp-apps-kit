# Restaurant Finder Example

A restaurant search app demonstrating advanced @mcp-apps-kit/core features.

## Features

- Multiple tools with different purposes
- ToolContext usage (location, timezone)
- React-based UI widget with @mcp-apps-kit/ui-react
- Different visibility settings (model vs app)
- Mood-based recommendations

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Or start production server
pnpm build
pnpm start
```

## Project Structure

```
restaurant-finder/
  src/
    index.ts         # Server with tool definitions
    ui/
      index.html     # Widget entry point
      main.tsx       # React widget
      styles.css     # Widget styles
  package.json
  tsconfig.json
  vite.config.ts
```

## Tools

### `searchRestaurants`

Search for restaurants with filters.

**Input:**
- `cuisine` (optional): Filter by cuisine type
- `maxDistance` (optional): Maximum distance in km
- `minRating` (optional): Minimum rating (1-5)
- `maxPrice` (optional): Maximum price level (1-4)
- `openOnly` (optional): Only show open restaurants

### `getRestaurantDetails`

Get detailed information about a specific restaurant.

**Input:**
- `restaurantId`: Restaurant ID

### `getRecommendations`

Get mood-based restaurant recommendations.

**Input:**
- `mood`: One of "quick", "romantic", "family", "business"

## Connecting to Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "restaurant-finder": {
      "command": "npx",
      "args": ["tsx", "path/to/examples/restaurant-finder/src/index.ts"]
    }
  }
}
```
