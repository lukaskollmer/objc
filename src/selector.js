// eslint-disable-next-line camelcase

// selector -- JS wrapper for ObjC SEL (ObjC method name); includes methods for converting ObjC (colon-delimited) names to JS names and back; also for use in ObjC methods that take selectors as arguments/return selectors as result


// TO DO: see existing test/test.js for examples of potentially method names; IMO it is a mistake to be 'forgiving' (e.g. allowing trailing underscores to be omitted) - it's convenient only up until the point it backfires, at which point the user has to figure out why; and if the rules which govern NS<->JS name translations are complicated and ambiguous, it makes it much harder for users to predict or diagnose why a given call fails; whereas if mappings are strictly 1:1 then any sloppiness or typos by user are caught that much quicker, and the rules for translating names learned that much easier

// TO DO: at this point, the only case that should trip up method name conversion is contiguous colons, e.g. `foo_bar::` (which afaik is legal, if not common nor recommended), as that will, in the current implementation, map to `foo__bar__`, which then maps back to `foo_bar_`, not `foo_bar::` (since double underscores in JS map to single underscores in SEL); fortuitously, JS does have an addition character that is legal in names, '$'; thus the rountripping can be made stable by using `$` to separate adjacent underscores in the JS name: thus `foo__bar_$_`; admittedly, this syntax is neither elegant nor intuitive, but it's such a rare use case that this can probably be lived with; the alternative would be to map either underscores OR colons to '$', e.g. `foo$bar__` or `foo_bar$$`; the former looks odd; however, the latter might be acceptable and its rules are the simplest of all: replace ':' with '$', and vice-versa, e.g. `objc.NSWorkspace.sharedWorkspace().launchApplicationAtURL$options$configuration$error$(…)`; its only disadvantage being that the '$' character does not provide the distinct visual word breaks that '_' does, which is why the `foo__bar_$_` syntax, though its rules are more complex, is probably still the best choice for everyday use

// BTW, once the mapping is finalized and implemented as Selector methods, it is trivial to provide a CLI utility script that reads an NS-style selector name string from line input and prints its JS representation to stdout (and vice-versa), and tell users who need assistance translating a method’s syntax to go use that


const constants = require('./constants');
const runtime = require('./runtime');



class Selector {
  #__ptr;

  constructor(input) { // create a Selector from string (e.g. 'foo:bar:') or existing SEL ptr
    // caution: this (public) constructor does not type check to ensure the given value is a string/SEL
    if (constants.isString(input)) {
      this.#__ptr = runtime.sel_getUid(input);
    } else {
      this.#__ptr = input;
    }
  }
  
  
  static selectorNameFromJS(name) {
    return name.replace(/__?/g, s => s.length === 1 ? ':' : '_'); // TO DO: see TODO above re. resolving remaining ambiguity
  }
  
  static selectorNameToJS(name) {
    return name.replace(/[:_]/g, s => { // TO DO: see TODO above re. resolving remaining ambiguity
      switch (s) {
      case ':':
        return '_';
      case '_':
        return '__';
      }
    });
  }
  
  
  static fromjs(selectorName) { // create a Selector from JS-style name, e.g. "foo_bar_"
    return new Selector(Selector.selectorNameFromJS(selectorName));
  }
  
  tojs() { // TO DO: see above TODO re. ambiguity
    // Result: string -- the method's JS (underscore-delimited) name
    return Selector.selectorNameToJS(this.name);
  }

  get name() { 
    // Result: string -- the method's ObjC (colon-delimited) name
    return runtime.sel_getName(this.#__ptr);
  }
  
  get ptr() { return this.#__ptr; }
  
  get [String.toStringTag]() { `Selector=${this.name}` }
}

module.exports = Selector;
