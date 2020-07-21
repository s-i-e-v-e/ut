/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {panic} from "./os.ts";

export function info(msg: string) {
    console.log(msg);
}

export function error(e: Error): never {
    return panic(e.message);
}

export function debug(e: Error): never {
    return panic(e.message);
}