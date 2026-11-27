// Polyfills for older browsers (TV browsers run old Chromium; package.json's
// browserslist goes down to Chrome 79). Next already lowers the syntax; these
// are the few newer built-ins our code and dependencies call. Each one only
// fills a gap, so up-to-date browsers skip all of it.

function define(target: object, name: string, value: unknown) {
  if (name in target) return;
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

// Array/String/TypedArray#at (Chrome 92).
function at(this: ArrayLike<unknown>, index: number) {
  const n = Math.trunc(index) || 0;
  const i = n < 0 ? this.length + n : n;
  return i < 0 || i >= this.length ? undefined : this[i];
}
define(Array.prototype, "at", at);
define(String.prototype, "at", at);
define(Object.getPrototypeOf(Int8Array.prototype), "at", at);

// Object.hasOwn (Chrome 93).
define(Object, "hasOwn", (obj: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, key));

// WeakRef (Chrome 84), used unguarded by the voice chat: a strong reference
// is enough for what it does with it.
if (typeof WeakRef === "undefined") {
  define(
    globalThis,
    "WeakRef",
    class<T extends object> {
      constructor(private readonly target: T) {}
      deref() {
        return this.target;
      }
    },
  );
}
