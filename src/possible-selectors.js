

// Caching reduces selector permutation generation from ~ 0.3 ms (first lookup) to ~ 0.05 ms (after first lookup)
const cache = {};


const joinSelectorWithPossiblePermutations = (selector, permutations) => {
  const split = selector.split('_');
  const methodName = split.shift();

  let selectors = [];
  permutations.forEach(permutation => {
    selectors.push(permutation.reduce((acc, val, index) => { return acc + val + split[index] }, methodName));
  });

  return selectors;
}


const getPossibleSelectorNames = selector => {
  if (!selector.includes('_')) {
    return [selector];
  }

  const n = selector.split('_').length - 1;

  let permutations = cache[n];

  if (typeof permutations !== 'undefined') {
    return joinSelectorWithPossiblePermutations(selector, permutations);
  }

  permutations = [];

  const numberOfPermutations = Math.pow(2, n);
  for (let i = 0; i < numberOfPermutations; i++) {
    permutations.push([]);
    for (let j = 0; j < n; j++) {
      const bitIsSet = (i & (1 << j)) != 0;
      permutations[i][j] = bitIsSet ? '_' : ':';
    }
  }

  cache[n] = permutations;
  return joinSelectorWithPossiblePermutations(selector, permutations);
}

module.exports = selector => getPossibleSelectorNames(selector);
