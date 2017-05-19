const itertools = require('itertools');

function repeatArray(array, count) {
  const temp = [];
  for (let i = 0; i < count; i++) {
    array.forEach(item => {
      temp.push(item);
    });
  }
  return temp;
}

function arrayAdd(array, other) {
  const temp = Array(...array);
  other.forEach(element => {
    temp.push(element);
  });
  return temp;
}

const filterDuplicates = input => input.filter((element, index) => input.indexOf(element) === index);

// Caching reduces selector loading from ~ 1.4 ms (first lookup) to ~ 0.15 ms (after first lookup)
const cache = {};

// We should be able to assume that all leading underscores can stay underscores because methods obviously can't start with an argument

function getPossibleSelectorNames(selector) {
  if (!selector.includes('_')) {
    return [selector];
  }

  const split = selector.split('_');
  const methodName = split.shift();
  const n = split.length;

  if (selector.endsWith(':') || selector.endsWith('_')) {
    split.push('');
  }

  let permutations = cache[n];
  if (permutations === undefined) {
    permutations = filterDuplicates(itertools.permutationsSync(repeatArray([':', '_'], n / 2), n));
    permutations = arrayAdd(permutations, [repeatArray([':'], n)]);
    permutations = arrayAdd(permutations, [repeatArray(['_'], n)]);

    cache[n] = permutations;
  }

  const selectors = [];

  permutations.forEach(permutation => {
    const sel = permutation.reduce((acc, val, index) => {
      return acc + val + split[index];
    }, methodName);
    selectors.push(sel);
  });

  const f = filterDuplicates(selectors);
  return f;
}

module.exports = selector => getPossibleSelectorNames(selector);
