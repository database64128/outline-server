#!/bin/bash -eu
#
# Copyright 2018 The Outline Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

source src/server_manager/scripts/fill_packaging_opts.sh "$0" "$@"

export BUILD_ENV='production'

yarn 'do' server_manager/electron_app/build
yarn 'do' server_manager/electron_app/write_production_environment

readonly BUILD_DIR=build/server_manager/electron_app/static

"${ROOT_DIR}/src/server_manager/node_modules/.bin/electron-builder" \
  --projectDir="${BUILD_DIR}" \
  --config.asarUnpack=server_manager/web_app/images \
  --config.generateUpdatesFilesForAllChannels=true \
  --publish=never \
  --config.publish.provider=generic \
  --config.publish.url=https://raw.githubusercontent.com/Jigsaw-Code/outline-releases/master/manager/ \
  --ia32 \
  --win nsis \
  --config.win.icon=icons/win/icon.ico \
  --config.win.certificateSubjectName='Jigsaw Operations LLC' \
  --config.artifactName="Outline-Manager.\${ext}"

src/server_manager/scripts/finish_info_files.sh win "${STAGING_PERCENTAGE}"
