/**
 * Restaurant Finder UI
 *
 * React widget demonstrating @mcp-apps-kit/ui-react usage:
 * - useAppsClient hook
 * - useHostContext for theme
 * - sendFollowUpMessage for interactions
 */

import React from "react";
import { createRoot } from "react-dom/client";
import {
  AppsProvider,
  useAppsClient,
  useHostContext,
  useDocumentTheme,
} from "@mcp-apps-kit/ui-react";
import "./styles.css";

interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  priceLevel: number;
  distance: number;
  address: string;
  openNow: boolean;
}

interface SearchOutput {
  restaurants: Restaurant[];
  count: number;
  searchArea?: string;
  reason?: string;
}

function App() {
  const client = useAppsClient();
  const context = useHostContext();
  useDocumentTheme("light", "dark");

  const output = client.toolOutput as SearchOutput | undefined;

  return (
    <div className="container">
      {output?.restaurants && output.restaurants.length > 0 ? (
        <>
          <header className="header">
            <h1>
              {output.reason || `${output.count} restaurants found`}
            </h1>
            {output.searchArea && (
              <p className="subtitle">in {output.searchArea}</p>
            )}
          </header>
          <ul className="restaurant-list">
            {output.restaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                onSelect={(id) => {
                  client.sendFollowUpMessage(
                    `Tell me more about the restaurant with ID ${id}`
                  );
                }}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="empty">
          <p>No restaurants found</p>
          <button
            className="button"
            onClick={() => client.sendFollowUpMessage("Show me all restaurants nearby")}
          >
            Search Nearby
          </button>
        </div>
      )}
      <footer className="footer">
        Theme: {context.theme}
      </footer>
    </div>
  );
}

function RestaurantCard({
  restaurant,
  onSelect,
}: {
  restaurant: Restaurant;
  onSelect: (id: string) => void;
}) {
  const priceSymbol = "$".repeat(restaurant.priceLevel);

  return (
    <li className="restaurant-card" onClick={() => onSelect(restaurant.id)}>
      <div className="card-header">
        <h2 className="name">{restaurant.name}</h2>
        <span className={`status ${restaurant.openNow ? "open" : "closed"}`}>
          {restaurant.openNow ? "Open" : "Closed"}
        </span>
      </div>
      <div className="card-details">
        <span className="cuisine">{restaurant.cuisine}</span>
        <span className="rating">{"*".repeat(Math.round(restaurant.rating))} {restaurant.rating}</span>
        <span className="price">{priceSymbol}</span>
      </div>
      <div className="card-footer">
        <span className="distance">{restaurant.distance} km away</span>
        <span className="address">{restaurant.address}</span>
      </div>
    </li>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <AppsProvider>
        <App />
      </AppsProvider>
    </React.StrictMode>
  );
}
