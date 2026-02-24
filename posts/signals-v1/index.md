---
title: "Signals in Angular 19: A Complete Guide"
slug: example-signals-in-angular-55
author: dominik.donoch@valueadd.pl
date: "2024-11-15T10:00:00Z"
category: Angular
tags:
  - signals
  - angular-19
  - state-management
  - reactivity
status: draft
difficulty: intermediate
excerpt: >
  Explore Angular 19's Signals API — a fine-grained reactivity primitive that
  replaces zone-based change detection for most use cases. Learn signal(),
  computed(), and effect() with real-world examples.
coverImage: ./assets/diagram.svg
---

Angular 19 elevates Signals from developer preview to stable API, making
fine-grained reactivity a first-class citizen of the framework. In this guide
we'll walk through every primitive, compare them to RxJS observables, and
build a fully reactive shopping-cart feature from scratch.

![Architecture overview](./assets/diagram.svg)

## Why Signals?

Zone.js change detection has served Angular well for over a decade, but it
comes with overhead: every browser event triggers a top-down tree traversal to
find dirty components. Signals solve this by tracking *exactly* which parts of
the template depend on which reactive values — so only the affected DOM nodes
are updated.

> "Signals give Angular the precision of Solid.js while keeping the familiar
> component model developers already know." — Angular team blog

Key benefits:

| Feature | Zone-based | Signals |
|---------|-----------|---------|
| Granularity | Component-level | Value-level |
| Debugging | Difficult | Explicit graph |
| SSR compatibility | Requires ngZone | Built-in |
| Bundle impact | ~35 kB (zone.js) | 0 kB extra |

---

## Core Primitives

### `signal()` — Writable State

A signal holds a value and notifies all dependants when it changes.

```typescript
import { signal } from '@angular/core';

const count = signal(0);

// Read the current value
console.log(count()); // 0

// Update
count.set(1);
count.update(v => v + 1); // 2

// Mutate objects/arrays in place
const items = signal<string[]>([]);
items.mutate(arr => arr.push('Angular'));
```

### `computed()` — Derived State

Computed signals are *lazy* and *memoised* — they only recalculate when one of
their dependencies changes and a consumer reads them.

```typescript
import { signal, computed } from '@angular/core';

const price = signal(49.99);
const quantity = signal(3);

const total = computed(() => price() * quantity());

console.log(total()); // 149.97
price.set(59.99);
console.log(total()); // 179.97  ← recalculated
```

### `effect()` — Side Effects

Effects run whenever any signal they read changes. They are the bridge between
the reactive graph and the imperative world (HTTP calls, analytics, local
storage, etc.).

```typescript
import { signal, effect } from '@angular/core';

const theme = signal<'light' | 'dark'>('light');

effect(() => {
  document.body.classList.toggle('dark', theme() === 'dark');
});

theme.set('dark'); // effect runs automatically
```

> **Warning:** Avoid setting signals inside an `effect()` unless you use
> `allowSignalWrites: true`. Circular updates cause infinite loops.

---

## Signals in Components

### Template Binding

Angular's template engine reads signals directly — no `async` pipe, no
`.value`, no `.subscribe()`:

```typescript
import { Component, signal, computed } from '@angular/core';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <p>Count: {{ count() }}</p>
    <p>Double: {{ double() }}</p>
    <button (click)="increment()">+1</button>
  `,
})
export class CounterComponent {
  count = signal(0);
  double = computed(() => this.count() * 2);

  increment() {
    this.count.update(v => v + 1);
  }
}
```

### Input Signals

Angular 19 adds signal-based `@Input` via the `input()` function:

```typescript
import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-greeting',
  standalone: true,
  template: `<h1>{{ message() }}</h1>`,
})
export class GreetingComponent {
  name = input.required<string>();   // throws if parent omits it
  message = computed(() => `Hello, ${this.name()}!`);
}
```

---

## Interoperability with RxJS

Most Angular apps have existing RxJS code. The `@angular/core/rxjs-interop`
package provides two-way conversion:

```typescript
import { signal, computed } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs/operators';

@Component({ /* ... */ })
export class SearchComponent {
  query = signal('');
  query$ = toObservable(this.query);

  results = toSignal(
    this.query$.pipe(
      switchMap(q => this.http.get<string[]>(`/api/search?q=${q}`)),
    ),
    { initialValue: [] as string[] },
  );

  constructor(private http: HttpClient) {}
}
```

---

## Shopping Cart Example

Let's build a real feature to cement everything together.

### State Model

```typescript
// cart.store.ts
import { Injectable, signal, computed } from '@angular/core';

export interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private _items = signal<CartItem[]>([]);

  readonly items = this._items.asReadonly();
  readonly total = computed(() =>
    this._items().reduce((sum, item) => sum + item.price * item.qty, 0),
  );
  readonly itemCount = computed(() =>
    this._items().reduce((sum, item) => sum + item.qty, 0),
  );

  add(item: Omit<CartItem, 'qty'>): void {
    this._items.update(items => {
      const existing = items.find(i => i.id === item.id);
      if (existing) {
        return items.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...items, { ...item, qty: 1 }];
    });
  }

  remove(id: number): void {
    this._items.update(items => items.filter(i => i.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }
}
```

### Cart Component

```html
<!-- cart.component.html -->
<div class="cart">
  <h2>Cart ({{ store.itemCount() }})</h2>

  @for (item of store.items(); track item.id) {
    <div class="cart-item">
      <span>{{ item.name }}</span>
      <span>{{ item.qty }} × {{ item.price | currency }}</span>
      <button (click)="store.remove(item.id)">Remove</button>
    </div>
  } @empty {
    <p>Your cart is empty.</p>
  }

  <strong>Total: {{ store.total() | currency }}</strong>
  <button (click)="store.clear()">Clear cart</button>
</div>
```

---

## Migration Tips

Running an existing Angular 18 app? Here's the upgrade path:

```shell
# Upgrade to Angular 19
ng update @angular/core@19 @angular/cli@19

# Run the schematics to migrate standalone components
ng generate @angular/core:standalone
```

Migrate zone-heavy components gradually — signals and `ChangeDetectionStrategy.OnPush`
are fully interoperable, so you can convert file by file without a big-bang rewrite.

---

## Summary

Angular 19 Signals give you:

- **Precision** — only affected nodes re-render
- **Clarity** — the reactive graph is explicit and debuggable
- **Simplicity** — no `async` pipe, no subscription management
- **Performance** — eliminates zone.js overhead in fully-signal components

The API surface is small (`signal`, `computed`, `effect`, `input`, `toSignal`,
`toObservable`) but its composition power is enormous. Start with a single
stateful component today and expand from there.

Happy coding!
