const itertools = require('itertools');

function repeatArray(array, count) {
  let temp = [];
  for (var i = 0; i < count; i++) {
    array.forEach(item => {
      temp.push(item);
    });
  }
  return temp;
}

function arrayAdd(array, other) {
  let temp = Array(...array);
  other.forEach(element => {
    temp.push(element);
  });
  return temp;
}

const filterDuplicates = input => input.filter((element, index) => input.indexOf(element) === index);

// Caching reduces selector loading from ~ 1.4 ms (first lookup) to ~ 0.15 ms (after first lookup)
let cache = {};

function getPossibleSelectorNames(selector) {
  if (!selector.includes('_')) {
    return [selector];
  }

  let split = selector.split('_');
  let methodName = split.shift();
  let n = split.length;

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

  let selectors = [];

  permutations.forEach(permutation => {
    let sel = permutation.reduce((acc, val, index) => {
      return acc + val + split[index];
    }, methodName);
    selectors.push(sel);
  });

  var f = filterDuplicates(selectors);
  return f;
}

module.exports = selector => getPossibleSelectorNames(selector);
