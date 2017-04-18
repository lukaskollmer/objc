//
// Created by Lukas Kollmer on 17.04.17.
//

#ifndef OBJC_OBJC_CALL_H
#define OBJC_OBJC_CALL_H

#define objc_call(returnType, target, sel, ...) \
    ({ \
        returnType (*___fn)(id, SEL, ...) = (returnType (*) (id, SEL, ...)) objc_msgSend; \
        returnType ___retval = ___fn(target, sel_getUid(sel), ##__VA_ARGS__); \
        ___retval; \
    }) \

#endif //OBJC_OBJC_CALL_H
