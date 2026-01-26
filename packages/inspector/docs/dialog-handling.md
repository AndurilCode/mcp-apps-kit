# Dialog Handling in Widget Sessions

## Current Behavior

Widget sessions automatically handle native browser dialogs (`alert()`, `confirm()`, `prompt()`, `beforeunload`) to prevent blocking the automation flow.

### Auto-Accept Policy

All dialogs are **automatically accepted**:

| Dialog Type | Behavior | Return Value |
|-------------|----------|--------------|
| `alert()` | Accepted | `undefined` |
| `confirm()` | Accepted | `true` |
| `prompt()` | Accepted with default value | `defaultValue` or `""` |
| `beforeunload` | Accepted | - |

### Tracking

Handled dialogs are tracked in the session and accessible via `get_widget_state`:

```json
{
  "dialogs": [
    {
      "type": "confirm",
      "message": "Delete this task?",
      "defaultValue": undefined,
      "handled": "accepted",
      "timestamp": 1706234567890
    }
  ]
}
```

## Limitation

The current auto-accept behavior prevents testing edge cases:

- User clicking "Cancel" on a confirmation dialog
- User entering custom values in prompt dialogs
- Widget behavior when dialogs are dismissed
- Error handling paths triggered by dialog cancellation

## Future Enhancement: Configurable Dialog Responses

A `widget_set_dialog_response` tool could allow pre-configuring how the next dialog should be handled:

### Proposed API

```typescript
// Tool: widget_set_dialog_response
{
  sessionId: string;
  action: "accept" | "dismiss";  // dismiss = Cancel button
  promptValue?: string;          // custom value for prompt() dialogs
}
```

### Example Workflow

```typescript
// 1. Configure next dialog to be dismissed
widget_set_dialog_response({
  sessionId: "...",
  action: "dismiss"
});

// 2. Trigger action that shows confirm dialog
widget_click({
  sessionId: "...",
  selector: ".delete-btn"
});

// 3. Dialog is dismissed (user clicked Cancel)
// Delete operation is cancelled

// 4. Verify behavior
get_widget_state({ sessionId: "..." });
// dialogs: [{ type: "confirm", message: "Delete?", handled: "dismissed" }]
```

### Implementation Notes

The implementation would:

1. Add a `pendingDialogResponse` field to `ActiveWidgetSession`
2. Modify the dialog handler in `createSession()` to check for pending response
3. Clear the pending response after handling (one-shot)
4. Default to auto-accept if no pending response is configured

```typescript
// In widget-session-manager.ts
page.on("dialog", async (dialog) => {
  const pending = session.pendingDialogResponse;
  session.pendingDialogResponse = undefined; // Clear after use

  const action = pending?.action ?? "accept";
  const trackedDialog: TrackedDialog = {
    type: dialog.type(),
    message: dialog.message(),
    defaultValue: dialog.defaultValue() || undefined,
    handled: action === "accept" ? "accepted" : "dismissed",
    timestamp: Date.now(),
  };

  session.dialogs.push(trackedDialog);

  if (action === "accept") {
    await dialog.accept(pending?.promptValue ?? dialog.defaultValue());
  } else {
    await dialog.dismiss();
  }
});
```

## Related Files

- `src/widget-session-manager.ts` - Dialog handler setup in `createSession()`
- `src/types.ts` - `TrackedDialog` interface
- `src/tools/get-widget-state.ts` - Exposes dialogs in state snapshot
