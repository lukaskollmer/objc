//
// Created by Lukas Kollmer on 21.04.17.
//

#include "constants.h"
#include "utils.h"

#include "objc_call.h"

extern "C" {
#include <CoreFoundation/CoreFoundation.h>
}


const char* GetSymbolWithStringFromBundleWithIdentifier(const char* symbol, const char* bundleIdentifier) {

    CFStringRef const symbolName = CFStringCreateWithCString(NULL, symbol, kCFStringEncodingUTF8);
    CFStringRef const bundleIdentifierCFStringRef = CFStringCreateWithCString(NULL, bundleIdentifier, kCFStringEncodingUTF8);
    CFBundleRef const bundle = CFBundleGetBundleWithIdentifier(bundleIdentifierCFStringRef);

    void** dataPtr = (void**)CFBundleGetDataPointerForName(bundle, symbolName);
    if (dataPtr != NULL) {

        id obj = (id)*dataPtr;
        id desc = objc_call(id, obj, "description");
        char* utf8 = objc_call(char*, desc, "UTF8String");

        return utf8;
    } else {
        return NULL;
    }
}

const char* GetSymbolWithString(const char* symbol) {

    CFArrayRef const allBundles = CFBundleGetAllBundles();

    CFIndex const count = CFArrayGetCount(allBundles);

    for (int i = 0; i < count; i++) {
        CFBundleRef const bundle = (CFBundleRef)CFArrayGetValueAtIndex(allBundles, i);

        if (CFBundleIsExecutableLoaded(bundle)) {
            CFStringRef bundleId = CFBundleGetIdentifier(bundle);

            if (bundleId == NULL) {
                continue;
            }

            const char* bundleIdChar = CFStringGetCStringPtr(bundleId, kCFStringEncodingUTF8);
            const char* constant = GetSymbolWithStringFromBundleWithIdentifier(symbol, bundleIdChar);

            if (constant) {
                return constant;
            } else {
                continue;
            }
        }
    }

    // should reach here only if the constant doesnt exist at all
    return nil;
}



const char* ObjC::GetConstantNamed(const char* name, const char* bundle) {
    bool didSpecifyBundle = bundle != NULL;

    if (didSpecifyBundle) {
        return GetSymbolWithStringFromBundleWithIdentifier(name, bundle);
    } else {
        return GetSymbolWithString(name);
    }
}
