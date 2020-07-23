/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import infer from "./infer.ts";
import check from "./check.ts";
import transform from "./transform.ts";
import Block from "./Block.ts";

export enum OperationType {
    DefVar,
    UseVar,
    Call,
    ReadImmediateInteger,
    ReadImmediateString,
    ReadID,
}

export interface Operation {
    opType: OperationType,
}

export interface ValOp extends Operation {}

export interface ReadImmediateInteger extends ValOp {
    value: BigInt,
}

export interface ReadImmediateString extends ValOp {
    value: string,
}

export interface ReadID extends ValOp {
    id: string,
}

export interface Call extends ValOp {
    id: string,
    vars: string[],
}

export interface UseVar extends Operation {
    dest: string;
    src: ValOp;
}

export {
    infer,
    check,
    transform,
    Block,
};