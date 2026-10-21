# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import os

BOX_ASSIST_URL = os.getenv("CVAT_BOX_ASSIST_URL", "http://localhost:8765")
"The base URL of the Box Assist inference service (components/box_assist)"

BOX_ASSIST_TIMEOUT = int(os.getenv("CVAT_BOX_ASSIST_TIMEOUT", 60))
"Timeout for a single inference request, in seconds"
