/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import Ut from "./mod.ts";

export default class Logger {
    static info(msg: string) {
        console.log(msg);
    }

    static error(e: Error) {
        return Ut.os.panic(e.message);
    }

    static debug(e: Error) {
        return Ut.os.panic(e.message);
    }
}