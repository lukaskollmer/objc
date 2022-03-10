// eslint-disable-next-line camelcase

// selector -- JS wrapper for ObjC SEL (ObjC method name)
//
// includes methods for converting ObjC-style (colon-delimited) selector names to JS-style method names and back
//
// also used in ObjC methods that take selectors as arguments/return selectors as result



// TO DO: JS<->NS name conversions are almost but not quite 100% stable; the one case that'll trip up method name conversion is 2 or more contiguous colons, e.g. `foo_bar::` (which afaik is legal, if not common nor recommended), as that will, in the current implementation, map to `foo__bar__`, which then maps back to `foo_bar_`, not `foo_bar::` (since double underscores in JS map to single underscores in SEL), making any such ObjC methods inaccessible from JS

// BTW, once the mapping is finalized and implemented as Selector methods, it is trivial to provide a CLI utility script that reads an NS-style selector name string from line input and prints its JS representation to stdout (and vice-versa), and tell users who need assistance translating a method’s syntax to go use that


const constants = require('./constants');
const runtime = require('./runtime');


// TO DO: should Selector constructor cache new Selector objects for reuse? (this is what ObjC does natively); from JS's POV it might not be that useful (the only benefit might be that it allows Selector objects to be directly compared using `===` operator)


class Selector {
  #__ptr;
  
  // utility functions for converting between NS- and JS-style method names, e.g. `foo:barBaz:` <-> `foo_barBaz_`
  // (these are attached to Selector 'class' simply to avoid further pollution of top-level `objc` namespace)
  
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
  
  // constructors
  
  constructor(input) { // create a Selector from string (e.g. 'foo:bar:') or existing SEL ptr
    // caution: this (public) constructor does not type check to ensure the given value is a string/SEL
    if (constants.isString(input)) {
      this.#__ptr = runtime.sel_getUid(input);
    } else {
      this.#__ptr = input;
    }
  }
  
  static fromjs(selectorName) { // create a Selector from JS-style name, e.g. "foo_bar_"
    return new Selector(Selector.selectorNameFromJS(selectorName));
  }
  
  // accessors
  
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
