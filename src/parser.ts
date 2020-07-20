/*
 * Copyright (c) 2020 Sieve
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
    SourceFile
} from "./common.ts"
import * as logger from "./logger.ts";

export default function parse(f: SourceFile) {
    logger.info(`Parsing: ${f.path}`);
}