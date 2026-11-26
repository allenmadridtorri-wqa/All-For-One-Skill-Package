// All For One — /crazycoder Zero-GC Object Pool for Projectiles, Particles & Events

export class ObjectPool<T> {
  private readonly items: T[];
  private readonly activeFlags: Uint8Array;
  private readonly freeStack: Int32Array;
  private freeTop: number;
  public readonly capacity: number;
  public activeCount = 0;

  constructor(capacity: number, factory: (index: number) => T) {
    if (capacity <= 0) {
      throw new Error(`ObjectPool capacity must be > 0, got ${capacity}`);
    }
    this.capacity = capacity;
    this.items = new Array<T>(capacity);
    this.activeFlags = new Uint8Array(capacity);
    this.freeStack = new Int32Array(capacity);
    this.freeTop = capacity;

    for (let i = 0; i < capacity; i++) {
      this.items[i] = factory(i);
      this.freeStack[i] = capacity - 1 - i;
    }
  }

  acquire(): { index: number; item: T } | null {
    if (this.freeTop <= 0) return null;
    this.freeTop -= 1;
    const index = this.freeStack[this.freeTop];
    this.activeFlags[index] = 1;
    this.activeCount += 1;
    return { index, item: this.items[index] };
  }

  /** Zero-allocation acquire returning index (-1 if exhausted). */
  acquireIndex(): number {
    if (this.freeTop <= 0) return -1;
    this.freeTop -= 1;
    const index = this.freeStack[this.freeTop];
    this.activeFlags[index] = 1;
    this.activeCount += 1;
    return index;
  }

  get(index: number): T {
    return this.items[index];
  }

  isActive(index: number): boolean {
    return this.activeFlags[index] === 1;
  }

  release(index: number): void {
    if (index < 0 || index >= this.capacity || this.activeFlags[index] === 0) return;
    this.activeFlags[index] = 0;
    this.freeStack[this.freeTop] = index;
    this.freeTop += 1;
    this.activeCount -= 1;
  }

  releaseAll(): void {
    this.activeFlags.fill(0);
    for (let i = 0; i < this.capacity; i++) {
      this.freeStack[i] = this.capacity - 1 - i;
    }
    this.freeTop = this.capacity;
    this.activeCount = 0;
  }

  forEachActive(visitor: (item: T, index: number) => void): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.activeFlags[i] === 1) {
        visitor(this.items[i], i);
      }
    }
  }
}
