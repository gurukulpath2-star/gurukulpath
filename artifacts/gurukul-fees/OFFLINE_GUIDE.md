# Offline Support Implementation Guide

This guide explains how the Gurukul Fees app now works offline.

## Overview

The app uses a **service worker** + **IndexedDB caching** + **Zustand state management** to provide a seamless offline experience.

### Key Features

✅ **Read data offline** — Students, fee records, payments cached locally  
✅ **Queue operations** — Create/update payments offline, sync when online  
✅ **Automatic sync** — Queued requests automatically sync when connection returns  
✅ **Offline indicators** — UI shows connection status and pending changes  
✅ **Selective caching** — API endpoints cached with network-first strategy  

---

## Architecture

### 1. Service Worker (`public/service-worker.js`)

**Responsibilities:**
- Intercepts all network requests
- Implements **network-first strategy** for API calls
  - Try network first
  - Fall back to cache if offline
  - Return 503 error if neither available
- Implements **cache-first strategy** for assets
  - Check cache first
  - Fall back to network
- Caches successful responses automatically

**Cache Strategy:**
```
┌─────────────────────────────────────────┐
│         Fetch Request                   │
└────────────┬────────────────────────────┘
             │
      ┌──────▼──────┐
      │ Is API call?│
      └──┬───────┬──┘
    Yes  │       │ No (asset)
        │        │
    ┌───▼──┐   ┌─▼──────┐
    │Network│  │ Cache? │
    │first  │  └─┬────┬─┘
    │strategy│   │Y   │N
    └────────┘   │    │
               ┌─▼─┐ ┌──▼──┐
               │OK │ │Fetch│
               └─┬─┘ └──┬──┘
                 │      │
              Cache  ┌──▼──┐
                     │Cache│
                     └─────┘
```

### 2. Offline Store (`hooks/useOfflineStore.ts`)

**Zustand store with persistence** (localStorage):

```typescript
{
  // Connection state
  isOnline: boolean
  
  // Queued requests (for failed mutations)
  queuedRequests: [
    {
      id: string          // Unique ID for deduplication
      method: string      // POST, PUT, DELETE, etc.
      url: string         // API endpoint
      body: unknown       // Request payload
      timestamp: number   // When queued
    }
  ]
  
  // Cached data (read from network, persisted locally)
  cachedStudents: unknown[]
  cachedFeeRecords: unknown[]
  cachedPayments: unknown[]
  
  // Draft data (for offline data entry)
  draftPayments: [
    {
      id: string
      studentId: string
      amount: number
      feeType: string
      timestamp: number
    }
  ]
}
```

**Persists to localStorage** so data survives browser restart.

### 3. Offline Sync Hook (`hooks/useOfflineSync.ts`)

**Handles:**
- Service worker registration
- Online/offline event listeners
- Automatic sync when connection returns
- Manual sync trigger
- Queue clearing

**Flow:**
```
User goes offline
    ↓
⚠️ OfflineIndicator shows
    ↓
User performs actions (cached read or queued write)
    ↓
User goes back online
    ↓
useOfflineSync triggers syncQueuedRequests()
    ↓
All queued requests sent to API
    ↓
✅ UI updates to "synced"
```

### 4. Components

**`<OfflineIndicator />`** — Toast-style notification showing:
- 🔴 **Offline**: "Changes will sync when you're back online"
- ⏳ **Syncing**: "N pending changes" with retry button
- ✅ **Synced**: "All changes synced, you're back online"

**`<OfflineUnavailableOverlay />`** — Modal for operations that *can't* be done offline (e.g., generating reports).

---

## Usage

### 1. Wrap Your App

```typescript
// App.tsx
import { AppWithOfflineSupport } from './AppWithOfflineSupport';

function App() {
  return (
    <AppWithOfflineSupport>
      <Router>
        <Dashboard />
        <Students />
        {/* ... */}
      </Router>
    </AppWithOfflineSupport>
  );
}
```

### 2. Use Cached Queries

```typescript
import { useCachedQuery } from '../hooks/useCachedQuery';

function StudentsList() {
  const { data, isLoading, error } = useCachedQuery(
    ['students'],
    () => fetch('/api/students').then(r => r.json()),
    { cacheKey: 'cachedStudents' }
  );
  
  // Shows cached data while offline
  // Automatically caches from network when online
  return (
    <>
      {isLoading && <div>Loading...</div>}
      {data && <ul>{/* render students */}</ul>}
      {error && <div>Error: {error.message}</div>}
    </>
  );
}
```

### 3. Queue Mutations for Offline

```typescript
import { useOfflineStore } from '../hooks/useOfflineStore';
import { useOfflineSync } from '../hooks/useOfflineSync';

function CollectFeeForm() {
  const { addQueuedRequest } = useOfflineStore();
  const { isOnline } = useOfflineSync();

  const handleSubmit = async (data) => {
    if (!isOnline) {
      // Queue for later sync
      addQueuedRequest({
        method: 'POST',
        url: '/api/payments',
        body: data,
      });
      
      toast.success('Saved offline. Will sync when online.');
      return;
    }
    
    // Perform mutation normally
    const response = await fetch('/api/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    if (response.ok) {
      toast.success('Payment recorded');
    }
  };
}
```

### 4. Show Offline Unavailable Message

```typescript
import { useOfflineSync } from '../hooks/useOfflineSync';
import { OfflineUnavailableOverlay } from '../components/OfflineIndicator';

function ReportsPage() {
  const { isOnline } = useOfflineSync();
  const [showOfflineError, setShowOfflineError] = useState(false);

  const handleGenerateReport = () => {
    if (!isOnline) {
      setShowOfflineError(true);
      return;
    }
    
    // Generate report
  };

  return (
    <>
      <button onClick={handleGenerateReport}>Generate Report</button>
      
      <OfflineUnavailableOverlay
        isVisible={showOfflineError}
        onDismiss={() => setShowOfflineError(false)}
        action="generate reports"
      />
    </>
  );
}
```

---

## Data Flow Examples

### Example 1: Reading Students While Offline

```
1. User opens Students page
2. useCachedQuery tries fetch('/api/students')
3. Service worker intercepts
4. Network request fails (offline)
5. Service worker checks cache
6. Returns cached student list
7. UI renders cached data
8. OfflineIndicator shows "you're offline"
```

### Example 2: Recording Payment While Offline

```
1. User fills payment form (offline)
2. User clicks "Record Payment"
3. handleSubmit detects isOnline === false
4. Calls addQueuedRequest({
     method: 'POST',
     url: '/api/payments',
     body: { studentId, amount, ... }
   })
5. Request stored in localStorage
6. UI shows "saved offline" toast
7. User goes back online
8. useOfflineSync detects online event
9. Calls syncQueuedRequests()
10. Sends POST /api/payments
11. Server creates payment record
12. UI updates to "synced"
```

### Example 3: Syncing Multiple Changes

```
Offline: User records 3 payments
Storage:
  queuedRequests: [
    { id: 1, method: 'POST', url: '/api/payments', body: {...} }
    { id: 2, method: 'POST', url: '/api/payments', body: {...} }
    { id: 3, method: 'POST', url: '/api/payments', body: {...} }
  ]

User goes online
↓
OfflineIndicator: "Syncing changes (3 pending)"
↓
syncQueuedRequests() loop:
  POST /api/payments (req 1) → success → removeQueuedRequest(1)
  POST /api/payments (req 2) → success → removeQueuedRequest(2)
  POST /api/payments (req 3) → success → removeQueuedRequest(3)
↓
queuedRequests: [] (empty)
↓
OfflineIndicator: "All changes synced"
```

---

## Testing Offline Locally

### Chrome DevTools

1. Open DevTools (F12)
2. Go to **Network** tab
3. Check **Offline** checkbox
4. App continues working with cached data
5. Try creating a payment (queued)
6. Uncheck **Offline**
7. Watch OfflineIndicator auto-sync

### Simulate Slow Network

1. DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Observe caching behavior
4. Service worker prioritizes cache hits

### Test Service Worker

DevTools → **Application** → **Service Workers**
- Shows SW registration status
- Can manually trigger update
- Can unregister for testing

---

## Files Added

```
artifacts/gurukul-fees/
├── public/
│   └── service-worker.js          # Network request interception
├── src/
│   ├── hooks/
│   │   ├── useOfflineStore.ts     # Zustand store with persistence
│   │   ├── useOfflineSync.ts      # SW registration & sync logic
│   │   └── useCachedQuery.ts      # Query hooks with caching
│   ├── components/
│   │   └── OfflineIndicator.tsx   # UI indicators & overlays
│   └── AppWithOfflineSupport.tsx  # Root wrapper component
└── OFFLINE_GUIDE.md               # This file
```

---

## Next Steps

1. **Update `index.html`** to register SW:
   ```html
   <link rel="manifest" href="/manifest.json">
   <meta name="theme-color" content="#000">
   ```

2. **Create `public/manifest.json`** for PWA:
   ```json
   {
     "name": "Gurukul Fees",
     "short_name": "Fees",
     "start_url": "/",
     "display": "standalone",
     "icons": [...]
   }
   ```

3. **Update API routes** to be idempotent for reliable syncing

4. **Test on real device** with WiFi toggle

---

## Gotchas & Best Practices

⚠️ **Idempotent APIs**: Queue retry means requests might be sent twice. Ensure POST `/api/payments` is idempotent (check for duplicate receipt numbers).

⚠️ **Stale Cache**: Cache never auto-clears. User must clear browser data or you clear on version bump.

⚠️ **Conflict Resolution**: If server data changes while offline, last-write-wins. Consider adding timestamps for better merging.

⚠️ **Large Uploads**: Queued requests in localStorage have size limits (~5-10MB per domain). Keep payloads small.

✅ **Test mutations**: Always test with DevTools offline mode.

✅ **User feedback**: Always show OfflineIndicator so users know why things feel slow.

✅ **Graceful degradation**: Some features (reports, bulk operations) should show "offline unavailable" overlay.
