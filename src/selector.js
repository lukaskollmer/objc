// eslint-disable-next-line camelcase
const {sel_getUid, sel_getName} = require('./runtime');


//

const cache = {}; // this is cache for permutations

const joinSelectorWithPossiblePermutations = (selector, permutations) => {
  const split = selector.split('_');
  const methodName = split.shift();

  const selectors = [];
  permutations.forEach(permutation => {
    // eslint-disable-next-line brace-style, max-statements-per-line
    selectors.push(permutation.reduce((acc, val, index) => { return acc + val + split[index]; }, methodName));
  });

  return selectors;
};

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
      permutations[i][j] = i & (1 << j) ? '_' : ':';
    }
  }

  cache[n] = permutations;
  return joinSelectorWithPossiblePermutations(selector, permutations);
};


//

class Selector {

  constructor(input) { // create a Selector from string (e.g. 'foo:bar:') or existing SEL ptr
    if (typeof input === 'string') {
      this.__ptr = sel_getUid(input);
    } else {
      this.__ptr = input;
    }
  }
  
  static fromjs(methodName) { // create a Selector from JS-style name, e.g. "foo_bar_"
  // TO DO: JS->NS name conversion should really be done on Selector, not here
  // method names are almost unambiguous: colons translate to underscores, and underscores to double underscores; the only time this would break is where a method name contains '::' (i.e. no text between the arguments, which is unlikely but - IIRC - legal)
  let objcName = methodName.replace(/__?/g, s => s.length === 1 ? ':' : '_');
  return new Selector(objcName);
  // TO DO: I've commented out the following as its purpose is not clear; I suspect it's intended to handle ambiguities in method naming, e.g. when user forgets a trailing underscore or when the ObjC name already includes underscores (e.g. `foo_bar:baz:`), but TBH the best way to handle ambiguities is not to permit them in the first place (the road to hell is already paved with "helpful, user-friendly" APIs: SGML, OAuth2, AppleScript, etc, etc, etc, which invariably aren't because their rules are so convoluted they are virtually unlearnable)
  /*
  if (selector.name.includes('_')) {
    for (const permutation of selector.permutations()) { // TO DO: what is purpose of this? presumably we need to support underscores in method names which do not correspond to arguments, although sensible way to do that is to add both JS and ObjC-style names to method cache, e.g. `foo_bar:baz:` and `foo_bar_baz_`, or escape underscores in name with a second underscore, e.g. `foo__bar_baz_`, or possibly omit the problem JS names entirely; we also need to watch out for leading underscores as those shouldn't convert to colons
      if (object.respondsToSelector(permutation)) {
        selector = permutation;
        break;
      }
    }
  }*/
}

  get name() {
    return sel_getName(this.__ptr);
  }
  
  // TO DO: tojs() which converts selector back to JS style

  permutations() { // TO DO: can we get rid of this now? if we can guarantee unique one-to-one mappings between JS and NS selector names, there will only be one possible permutation for any given name
    return getPossibleSelectorNames(this.name).map(p => new Selector(p));
  }
}

module.exports = Selector;
