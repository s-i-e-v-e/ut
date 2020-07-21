/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import parse from "./parser.ts";
import Ut from "./util/mod.ts";
const Logger = Ut.logger;

export default async function run(path: string) {
    try {
        const f = await Ut.os.readSourceFile(path);
        Logger.info(`Running: ${path} [${f.fsPath}]`);
        parse(f);
    }
    catch (e) {
        Logger.error(e)
    }
}