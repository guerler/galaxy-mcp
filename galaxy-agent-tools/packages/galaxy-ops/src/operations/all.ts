// Every op, for a Node host. The ones that run anywhere come from all-browser; the rest
// are listed here because they read or write a local filesystem, which a browser has not
// got. That is a property of these implementations, not of the operations themselves.
import "./all-browser";

import "./download-dataset";
import "./upload-file";
