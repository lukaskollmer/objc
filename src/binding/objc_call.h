//
// Created by Lukas Kollmer on 17.04.17.
//

#ifndef OBJC_OBJC_CALL_H
#define OBJC_OBJC_CALL_H

extern "C" {
#include <objc/runtime.h>
#include <objc/message.h>
};

#define objc_call(returnType, target, sel, ...) \
    ({ \
        returnType (*___fn)(id, SEL, ...) = (returnType (*) (id, SEL, ...)) objc_msgSend; \
        returnType ___retval = ___fn(target, sel_getUid(sel), ##__VA_ARGS__); \
        ___retval; \
    }) \

#define objc_call_noreturn(returnType, target, sel, ...) \
    ({ \
        returnType (*___fn)(id, SEL, ...) = (returnType (*) (id, SEL, ...)) objc_msgSend; \
        ___fn(target, sel_getUid(sel), ##__VA_ARGS__); \
    }) \

#endif //OBJC_OBJC_CALL_H
