/**
 * Unit tests for error classes
 */

import { describe, it, expect } from "vitest";
import {
  TestingError,
  ConnectionError,
  TimeoutError,
  ServerStartupError,
  AssertionError,
  PropertyFailureError,
  ConfigurationError,
} from "../../src/errors";

describe("TestingError", () => {
  it("should create error with code and message", () => {
    const error = new TestingError("TEST_CODE", "Test message");
    expect(error.code).toBe("TEST_CODE");
    expect(error.message).toBe("Test message");
    expect(error.name).toBe("TestingError");
    expect(error.cause).toBeUndefined();
  });

  it("should create error with cause", () => {
    const cause = new Error("Original error");
    const error = new TestingError("TEST_CODE", "Test message", cause);
    expect(error.cause).toBe(cause);
  });

  it("should serialize to JSON", () => {
    const error = new TestingError("TEST_CODE", "Test message");
    const json = error.toJSON();
    expect(json.name).toBe("TestingError");
    expect(json.code).toBe("TEST_CODE");
    expect(json.message).toBe("Test message");
    expect(json.stack).toBeDefined();
    expect(json.cause).toBeUndefined();
  });

  it("should serialize cause to JSON", () => {
    const cause = new Error("Original error");
    const error = new TestingError("TEST_CODE", "Test message", cause);
    const json = error.toJSON();
    expect(json.cause).toBe("Error: Original error");
  });
});

describe("ConnectionError", () => {
  it("should create error with URL", () => {
    const error = new ConnectionError("http://localhost:3000");
    expect(error.code).toBe("CONNECTION_ERROR");
    expect(error.message).toBe("Failed to connect to http://localhost:3000");
    expect(error.name).toBe("ConnectionError");
    expect(error.url).toBe("http://localhost:3000");
  });

  it("should create error with custom message", () => {
    const error = new ConnectionError("http://localhost:3000", "Custom message");
    expect(error.message).toBe("Custom message");
  });

  it("should create error with cause", () => {
    const cause = new Error("Network failure");
    const error = new ConnectionError("http://localhost:3000", undefined, cause);
    expect(error.cause).toBe(cause);
  });
});

describe("TimeoutError", () => {
  it("should create error with timeout value", () => {
    const error = new TimeoutError(5000);
    expect(error.code).toBe("TIMEOUT_ERROR");
    expect(error.message).toBe("Operation timed out after 5000ms");
    expect(error.name).toBe("TimeoutError");
    expect(error.timeout).toBe(5000);
  });

  it("should create error with custom message", () => {
    const error = new TimeoutError(5000, "Custom timeout message");
    expect(error.message).toBe("Custom timeout message");
  });

  it("should create error with cause", () => {
    const cause = new Error("Underlying timeout");
    const error = new TimeoutError(5000, undefined, cause);
    expect(error.cause).toBe(cause);
  });
});

describe("ServerStartupError", () => {
  it("should create error with minimal info", () => {
    const error = new ServerStartupError();
    expect(error.code).toBe("SERVER_STARTUP_ERROR");
    expect(error.message).toBe("Server failed to start");
    expect(error.name).toBe("ServerStartupError");
  });

  it("should create error with command", () => {
    const error = new ServerStartupError("npm run start");
    expect(error.message).toBe("Server failed to start: npm run start");
    expect(error.command).toBe("npm run start");
  });

  it("should create error with timeout", () => {
    const error = new ServerStartupError("npm run start", 10000);
    expect(error.message).toBe("Server failed to start: npm run start (timeout: 10000ms)");
    expect(error.timeout).toBe(10000);
  });

  it("should create error with stderr", () => {
    const error = new ServerStartupError("npm run start", undefined, "Error output");
    expect(error.stderr).toBe("Error output");
  });

  it("should create error with custom message", () => {
    const error = new ServerStartupError("npm run start", 10000, "stderr", "Custom error");
    expect(error.message).toBe("Custom error");
  });

  it("should create error with cause", () => {
    const cause = new Error("Process exited");
    const error = new ServerStartupError("npm run start", 10000, "stderr", undefined, cause);
    expect(error.cause).toBe(cause);
  });
});

describe("AssertionError", () => {
  it("should create error with actual and expected values", () => {
    const error = new AssertionError("actual", "expected");
    expect(error.code).toBe("ASSERTION_ERROR");
    expect(error.message).toBe("Assertion failed");
    expect(error.name).toBe("AssertionError");
    expect(error.actual).toBe("actual");
    expect(error.expected).toBe("expected");
  });

  it("should create error with custom message", () => {
    const error = new AssertionError(1, 2, "Values do not match");
    expect(error.message).toBe("Values do not match");
  });
});

describe("PropertyFailureError", () => {
  it("should create error with failing and shrunk inputs", () => {
    const error = new PropertyFailureError({ x: 100 }, { x: 0 });
    expect(error.code).toBe("PROPERTY_FAILURE");
    expect(error.message).toBe("Property test failed");
    expect(error.name).toBe("PropertyFailureError");
    expect(error.failingInput).toEqual({ x: 100 });
    expect(error.shrunkInput).toEqual({ x: 0 });
  });

  it("should create error with custom message", () => {
    const error = new PropertyFailureError({ x: 100 }, { x: 0 }, "Custom failure message");
    expect(error.message).toBe("Custom failure message");
  });

  it("should create error with seed and shrink count", () => {
    const error = new PropertyFailureError({ x: 100 }, { x: 0 }, undefined, 12345, 10);
    expect(error.seed).toBe(12345);
    expect(error.numShrinks).toBe(10);
  });

  it("should return reproduce hint with seed", () => {
    const error = new PropertyFailureError({ x: 100 }, { x: 0 }, undefined, 12345);
    expect(error.getReproduceHint()).toBe("To reproduce this failure, run with seed: 12345");
  });

  it("should return generic reproduce hint without seed", () => {
    const error = new PropertyFailureError({ x: 100 }, { x: 0 });
    expect(error.getReproduceHint()).toBe(
      "Set a seed in test options to make failures reproducible"
    );
  });

  it("should serialize to JSON with extra fields", () => {
    const error = new PropertyFailureError({ x: 100 }, { x: 0 }, undefined, 12345, 10);
    const json = error.toJSON();
    expect(json.failingInput).toEqual({ x: 100 });
    expect(json.shrunkInput).toEqual({ x: 0 });
    expect(json.seed).toBe(12345);
    expect(json.numShrinks).toBe(10);
    expect(json.code).toBe("PROPERTY_FAILURE");
  });
});

describe("ConfigurationError", () => {
  it("should create error with missing field", () => {
    const error = new ConfigurationError("API_KEY");
    expect(error.code).toBe("CONFIGURATION_ERROR");
    expect(error.message).toBe("Missing required configuration: API_KEY");
    expect(error.name).toBe("ConfigurationError");
    expect(error.missing).toBe("API_KEY");
  });

  it("should create error with custom message", () => {
    const error = new ConfigurationError("API_KEY", "Custom config error");
    expect(error.message).toBe("Custom config error");
  });
});
