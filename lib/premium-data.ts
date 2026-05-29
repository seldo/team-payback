// Stand-in for a real premium data provider. Replace with whatever paid API
// your hack actually calls (search, real-time data, etc.).
export function premiumData(symbol: string) {
  return {
    symbol: symbol.toUpperCase(),
    price: 65000 + Math.round(Math.random() * 2000),
    asOf: new Date().toISOString(),
    source: "premium-data-provider",
  };
}
