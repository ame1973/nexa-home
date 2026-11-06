// Release CLI fixtures must own their context, not inherit a real job's plan or tokens.
export function fixtureEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !/^(?:GITHUB_|GH_|NEXA_)/.test(key),
    ),
  );
}
