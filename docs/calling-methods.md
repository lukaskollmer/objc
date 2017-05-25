# Calling methods

When calling Objective-C methods, all you need to do is replace the colons in the selector with underscores.

For example, this Objective-C code:

```objc
#import <AppKit/AppKit.h>

NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
[pasteboard declareTypes:@[NSPasteboardTypeString] owner:nil];

[pasteboard setString:@"44 > 45" forType:NSPasteboardTypeString];
```

is equivalent to the following JavaScript code:

```js
const {NSPasteboard, NSPasteboardTypeString} = require('objc');

let pasteboard = NSPasteboard.generalPasteboard();
pasteboard.declareTypes_owner_([NSPasteboardTypeString], null);

pasteboard.setString_forType_("44 > 45", NSPasteboardTypeString);
```

### Trailing underscores

If a method ends with an underscore (basically all methods that take parameters), you can omit the last underscore.

The following examples are equivalent:
```js
const {NSString} = require('objc');

let str1 = NSString.stringWithString_('Hello World');
let str2 = NSString.stringWithString('Hello World');
```