const itertools = require('itertools');

/**
TODO: We should probably avoid polluting the global namespace 😬
*/

Array.prototype.times = function(count) {
  let temp = [];
  for (var i = 0; i < count; i++) {
    this.forEach(item => {
      temp.push(item);
    });
  }
  return temp;
}

Array.prototype.add = function(array) {
  let temp = Array(...this);
  array.forEach(element => {
    temp.push(element);
  })
  return temp;
}


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
    permutations = filterDuplicates(itertools.permutationsSync([":", "_"].times(n/2), n)
      .add([[':'].times(n)])
      .add([['_'].times(n)]));

    cache[n] = permutations;
  }

  let selectors = [];

  permutations.forEach((permutation) => {
    let sel = permutation.reduce((acc, val, index) => {
      return acc + val + split[index];
    }, methodName);
    selectors.push(sel);
  });

  var f = filterDuplicates(selectors);
  return f;
}

const filterDuplicates = input => input.filter((element, index) => input.indexOf(element) == index);

module.exports = selector => getPossibleSelectorNames(selector);