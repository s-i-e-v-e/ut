/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import SymbolTable from "./SymbolTable.ts";
import TypeResolver from "./TypeResolver.ts";
import { resolveVar } from "./check.ts";
import {Dictionary} from "../util/mod.ts";


type GenericMap<A> = Dictionary<Dictionary<A>>;

// size(String) => size(String)
// size[A](Array[A]) => size[A](Array[A])
// size[A](A) => size[A](A) -- may collide with 1&2 above

// size("hello") => size(String)
// size(Array(true)) => size(Array[Bool])
// size(Array(1)) => size(Array[Int64])
// size(Array("a)) => size(Array[String])
interface qGenericMap<A> {
    a: Dictionary<A[]>; // ["size"] = [fn:size[A]]; ["size[$A]"] = [fn:size[A]];  ["size[$String]"] = [fn:size[String]];
    /*
        "size" = {
            "size($String)": fn,
            "size[$A]($Array[$A])": fn,
            "size[$A]($A)": fn,
        },



    */
}

interface TypeEntry<A> {
    id: string,
    mangledName: string,
    base: A,
    reifications: A[]
}

export {
    SymbolTable,
    resolveVar,
    TypeResolver,
    GenericMap,
};