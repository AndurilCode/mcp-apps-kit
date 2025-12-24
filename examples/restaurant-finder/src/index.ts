/**
 * Restaurant Finder Example App
 *
 * Demonstrates advanced @mcp-apps-kit/core features:
 * - Multiple tools with relationships
 * - ToolContext usage (location, timezone)
 * - Different visibility settings
 * - Widget with complex data
 * - Type-safe handlers using defineTool (no type assertions!)
 */

import { createApp, defineTool, type ClientToolsFromCore, type ToolContext } from "@mcp-apps-kit/core";
import { z } from "zod";

// =============================================================================
// DATA TYPES
// =============================================================================

interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  priceLevel: 1 | 2 | 3 | 4;
  distance: number; // km
  address: string;
  openNow: boolean;
}

// =============================================================================
// MOCK DATA
// =============================================================================

const restaurants: Restaurant[] = [
  {
    id: "r1",
    name: "Sakura Sushi",
    cuisine: "Japanese",
    rating: 4.5,
    priceLevel: 3,
    distance: 0.3,
    address: "123 Main St",
    openNow: true,
  },
  {
    id: "r2",
    name: "Bella Italia",
    cuisine: "Italian",
    rating: 4.2,
    priceLevel: 2,
    distance: 0.8,
    address: "456 Oak Ave",
    openNow: true,
  },
  {
    id: "r3",
    name: "Golden Dragon",
    cuisine: "Chinese",
    rating: 4.0,
    priceLevel: 2,
    distance: 1.2,
    address: "789 Pine Blvd",
    openNow: false,
  },
  {
    id: "r4",
    name: "Le Petit Bistro",
    cuisine: "French",
    rating: 4.8,
    priceLevel: 4,
    distance: 2.1,
    address: "321 Elm St",
    openNow: true,
  },
  {
    id: "r5",
    name: "Taco Fiesta",
    cuisine: "Mexican",
    rating: 4.1,
    priceLevel: 1,
    distance: 0.5,
    address: "654 Cedar Ln",
    openNow: true,
  },
];

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const RestaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuisine: z.string(),
  rating: z.number(),
  priceLevel: z.number().min(1).max(4),
  distance: z.number(),
  address: z.string(),
  openNow: z.boolean(),
});

const CuisineTypeSchema = z.enum(["Japanese", "Italian", "Chinese", "French", "Mexican", "any"]);

// Tool input schemas (extracted for type inference)
const SearchRestaurantsInput = z.object({
  cuisine: CuisineTypeSchema.optional().describe("Filter by cuisine type"),
  maxDistance: z.number().optional().describe("Maximum distance in km"),
  minRating: z.number().min(1).max(5).optional().describe("Minimum rating"),
  maxPrice: z.number().min(1).max(4).optional().describe("Maximum price level (1-4)"),
  openOnly: z.boolean().optional().describe("Only show open restaurants"),
});

const GetRestaurantDetailsInput = z.object({
  restaurantId: z.string().describe("Restaurant ID"),
});

const GetRecommendationsInput = z.object({
  mood: z.enum(["quick", "romantic", "family", "business"]).describe("Dining mood"),
});

// =============================================================================
// APP DEFINITION
// =============================================================================

const app = createApp({
  name: "restaurant-finder",
  version: "1.0.0",

  tools: {
    // =========================================================================
    // SEARCH RESTAURANTS (Model + Widget tool)
    // =========================================================================
    searchRestaurants: defineTool({
      title: "Search Restaurants",
      description: "Search for restaurants with filters",
      input: SearchRestaurantsInput,
      output: z.object({
        restaurants: z.array(RestaurantSchema),
        count: z.number(),
        searchArea: z.string().optional(),
      }),
      ui: "restaurant-list",
      visibility: "both",
      widgetAccessible: true,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      handler: async (input, context) => {
        let results = [...restaurants];

        // Apply filters
        if (input.cuisine && input.cuisine !== "any") {
          results = results.filter((r) => r.cuisine === input.cuisine);
        }
        if (input.maxDistance !== undefined) {
          results = results.filter((r) => r.distance <= input.maxDistance!);
        }
        if (input.minRating !== undefined) {
          results = results.filter((r) => r.rating >= input.minRating!);
        }
        if (input.maxPrice !== undefined) {
          results = results.filter((r) => r.priceLevel <= input.maxPrice!);
        }
        if (input.openOnly) {
          results = results.filter((r) => r.openNow);
        }

        // Sort by distance
        results.sort((a, b) => a.distance - b.distance);

        // Use location from context if available
        const searchArea = context.userLocation?.city ?? "your area";

        return {
          restaurants: results,
          count: results.length,
          searchArea,
          _text: `Found ${results.length} restaurant${results.length !== 1 ? "s" : ""}`,
        };
      },
    }),

    // =========================================================================
    // GET RESTAURANT DETAILS
    // =========================================================================
    getRestaurantDetails: defineTool({
      title: "Get Restaurant Details",
      description: "Get detailed information about a specific restaurant",
      input: GetRestaurantDetailsInput,
      output: z.object({
        restaurant: RestaurantSchema.nullable(),
        message: z.string(),
      }),
      visibility: "both",
      widgetAccessible: true,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      handler: async (input) => {
        const restaurant = restaurants.find((r) => r.id === input.restaurantId);

        if (!restaurant) {
          return {
            restaurant: null,
            message: `Restaurant with ID "${input.restaurantId}" not found`,
            _text: `Restaurant with ID "${input.restaurantId}" not found`,
          };
        }

        return {
          restaurant,
          message: `Found ${restaurant.name}`,
          _text: `Found ${restaurant.name}`,
        };
      },
    }),

    // =========================================================================
    // GET RECOMMENDATIONS
    // =========================================================================
    getRecommendations: defineTool({
      title: "Get Recommendations",
      description: "Get personalized restaurant recommendations",
      input: GetRecommendationsInput,
      output: z.object({
        recommendations: z.array(RestaurantSchema),
        reason: z.string(),
      }),
      ui: "restaurant-list",
      visibility: "both",
      annotations: {
        readOnlyHint: true,
      },
      handler: async (input, context) => {
        let filtered: Restaurant[];
        let reason: string;

        switch (input.mood) {
          case "quick":
            filtered = restaurants.filter((r) => r.distance < 1 && r.priceLevel <= 2).slice(0, 3);
            reason = "Quick bites near you";
            break;
          case "romantic":
            filtered = restaurants.filter((r) => r.rating >= 4.5 && r.priceLevel >= 3).slice(0, 3);
            reason = "Romantic dining options";
            break;
          case "family":
            filtered = restaurants.filter((r) => r.priceLevel <= 2 && r.rating >= 4.0).slice(0, 3);
            reason = "Family-friendly choices";
            break;
          case "business":
            filtered = restaurants.filter((r) => r.priceLevel >= 3 && r.rating >= 4.2).slice(0, 3);
            reason = "Professional dining venues";
            break;
          default:
            filtered = restaurants.slice(0, 3);
            reason = "Top picks";
        }

        // Include timezone in response metadata
        const timezone = context.userLocation?.timezone ?? "UTC";

        return {
          recommendations: filtered,
          reason,
          _meta: { timezone, mood: input.mood },
        };
      },
    }),
  },

  // ===========================================================================
  // UI RESOURCES
  // ===========================================================================
  ui: {
    "restaurant-list": {
      name: "Restaurant List Widget",
      description: "Displays restaurant search results",
      widgetDescription:
        "An interactive list showing restaurants with name, cuisine, rating, price level, and distance. Users can view details and get directions.",
      html: "./src/ui/dist/index.html",
      prefersBorder: true,
    },
  },

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  config: {
    cors: {
      origin: true,
    },
    protocol: "mcp",
  },
});

export type RestaurantFinderClientTools = ClientToolsFromCore<typeof app.tools>;

// =============================================================================
// START SERVER
// =============================================================================

const port = parseInt(process.env.PORT || "3002");

app.start({ port }).then(() => {
  console.log(`
Restaurant Finder Server running on http://localhost:${port}
MCP endpoint: http://localhost:${port}/mcp

Available Tools:
- searchRestaurants: Search with filters (cuisine, distance, rating, price)
- getRestaurantDetails: Get detailed info for a restaurant
- getRecommendations: Get mood-based recommendations
  `);
});
