// Manual mock for @prisma/client/runtime/library

export class Decimal {
  private readonly _value: string;

  constructor(value: string | number) {
    this._value = String(value);
  }

  toString(): string {
    return this._value;
  }

  equals(other: Decimal): boolean {
    return this._value === other._value;
  }
}
