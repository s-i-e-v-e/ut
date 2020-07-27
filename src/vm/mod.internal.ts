/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export enum VmOperation {
    ADD_R_R,
    ADD_R_I,
    SUB_R_R,
    SUB_R_I,
    MUL_R_R,
    MUL_R_I,
    DIV_R_R,
    DIV_R_I,
    MOD_R_R,
    MOD_R_I,
    MOV_R_R,
    MOV_R_I,
    MOV_R_M,
    MOV_M_R,
    MOV_R_RO,
    MOV_RO_R,
    CMP_R_R,
    CMP_R_I,
    AND_R_R,
    OR_R_R,
    NOT,
    SET_E,
    SET_NE,
    SET_LT,
    SET_LE,
    SET_GT,
    SET_GE,
    PUSH_I,
    PUSH,
    POP,
    CALL,
    JMP,
    JZ,
    JNZ,
    RET,
}