'use strict';

const objc = require('../src/index.js');

objc.import('AppKit');

const {
  NSPasteboard,
  NSString,
  NSArray
} = objc;

const NSPasteboardTypeString = objc.constant('NSPasteboardTypeString', 'com.apple.AppKit');

let pasteboard = NSPasteboard.generalPasteboard();
pasteboard.declareTypes_owner_(NSArray.arrayWithObject_(NSPasteboardTypeString), null);

const get = () => {
  return pasteboard.stringForType_(NSPasteboardTypeString);
}

const set = text => {
  let oldValue = get();
  pasteboard.setString_forType_(text, NSPasteboardTypeString);
  return oldValue;
}


set('Hello World!');

let contents = get(); // This is now still an `NSString`

console.log(String(contents)); // The `String(...)` call converts the `NSString to a native JavaScript string object`
