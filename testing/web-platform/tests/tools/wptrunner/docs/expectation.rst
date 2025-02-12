Expectation Data
================

Introduction
------------

For use in continuous integration systems, and other scenarios where
regression tracking is required, wptrunner supports storing and
loading the expected result of each test in a test run. Typically
these expected results will initially be generated by running the
testsuite in a baseline build. They may then be edited by humans as
new features are added to the product that change the expected
results. The expected results may also vary for a single product
depending on the platform on which it is run. Therefore, the raw
structured log data is not a suitable format for storing these
files. Instead something is required that is:

 * Human readable

 * Human editable

 * Machine readable / writable

 * Capable of storing test id / result pairs

 * Suitable for storing in a version control system (i.e. text-based)

The need for different results per platform means either having
multiple expectation files for each platform, or having a way to
express conditional values within a certain file. The former would be
rather cumbersome for humans updating the expectation files, so the
latter approach has been adopted, leading to the requirement:

 * Capable of storing result values that are conditional on the platform.

There are few extant formats that meet these requirements, so
wptrunner uses a bespoke ``expectation manifest`` format, which is
closely based on the standard ``ini`` format.

Directory Layout
----------------

Expectation manifest files must be stored under the ``metadata``
directory passed to the test runner. The directory layout follows that
of web-platform-tests with each test path having a corresponding
manifest file. Tests that differ only by query string, or reftests
with the same test path but different ref paths share the same
reference file. The file name is taken from the last /-separated part
of the path, suffixed with ``.ini``.

As an optimisation, files which produce only default results
(i.e. ``PASS`` or ``OK``) don't require a corresponding manifest file.

For example a test with url::

  /spec/section/file.html?query=param

would have an expectation file ::

  metadata/spec/section/file.html.ini


.. _wptupdate-label:

Generating Expectation Files
----------------------------

wptrunner provides the tool ``wptupdate`` to generate expectation
files from the results of a set of baseline test runs. The basic
syntax for this is::

  wptupdate [options] [logfile]...

Each ``logfile`` is a structured log file from a previous run. These
can be generated from wptrunner using the ``--log-raw`` option
e.g. ``--log-raw=structured.log``. The default behaviour is to update
all the test data for the particular combination of hardware and OS
used in the run corresponding to the log data, whilst leaving any
other expectations untouched.

wptupdate takes several useful options:

``--sync``
  Pull the latest version of web-platform-tests from the
  upstream specified in the config file. If this is specified in
  combination with logfiles, it is assumed that the results in the log
  files apply to the post-update tests.

``--no-check-clean``
  Don't attempt to check if the working directory is clean before
  doing the update (assuming that the working directory is a git or
  mercurial tree).

``--patch``
  Create a a git commit, or a mq patch, with the changes made by wptupdate.

``--ignore-existing``
  Overwrite all the expectation data for any tests that have a result
  in the passed log files, not just data for the same platform.

``--disable-intermittent``
  When updating test results, disable tests that have inconsistent
  results across many runs. This can precede a message providing a
  reason why that test is disable. If no message is provided,
  ``unstable`` is the default text.

``--update-intermittent``
  When this option is used, the ``expected`` key (see below) stores
  expected intermittent statuses in addition to the primary expected
  status. If there is more than one status, it appears as a list. The
  default behaviour of this option is to retain any existing intermittent
  statuses in the list unless ``--remove-intermittent`` is specified.

``--remove-intermittent``
  This option is used in conjunction with ``--update-intermittent``.
  When the ``expected`` statuses are updated, any obsolete intermittent
  statuses that did not occur in the specified logfiles are removed from
  the list.

Examples
~~~~~~~~

Update the local copy of web-platform-tests without changing the
expectation data and commit (or create a mq patch for) the result::

  wptupdate --patch --sync

Update all the expectations from a set of cross-platform test runs::

  wptupdate --no-check-clean --patch osx.log linux.log windows.log

Add expectation data for some new tests that are expected to be
platform-independent::

  wptupdate --no-check-clean --patch --ignore-existing tests.log

Manifest Format
---------------
The format of the manifest files is based on the ini format. Files are
divided into sections, each (apart from the root section) having a
heading enclosed in square braces. Within each section are key-value
pairs. There are several notable differences from standard .ini files,
however:

 * Sections may be hierarchically nested, with significant whitespace
   indicating nesting depth.

 * Only ``:`` is valid as a key/value separator

A simple example of a manifest file is::

  root_key: root_value

  [section]
    section_key: section_value

    [subsection]
       subsection_key: subsection_value

  [another_section]
    another_key: another_value

The web-platform-test harness knows about several keys:

`expected`
  Must evaluate to a possible test status indicating the expected
  result of the test. The implicit default is PASS or OK when the
  field isn't present. When `expected` is a list, the first status
  is the primary expected status and the trailing statuses listed are
  expected intermittent statuses.

`disabled`
  Any value indicates that the test is disabled.

`reftype`
  The type of comparison for reftests; either `==` or `!=`.

`refurl`
  The reference url for reftests.

Conditional Values
~~~~~~~~~~~~~~~~~~

In order to support values that depend on some external data, the
right hand side of a key/value pair can take a set of conditionals
rather than a plain value. These values are placed on a new line
following the key, with significant indentation. Conditional values
are prefixed with ``if`` and terminated with a colon, for example::

  key:
    if cond1: value1
    if cond2: value2
    value3

In this example, the value associated with ``key`` is determined by
first evaluating ``cond1`` against external data. If that is true,
``key`` is assigned the value ``value1``, otherwise ``cond2`` is
evaluated in the same way. If both ``cond1`` and ``cond2`` are false,
the unconditional ``value3`` is used.

Conditions themselves use a Python-like expression syntax. Operands
can either be variables, corresponding to data passed in, numbers
(integer or floating point; exponential notation is not supported) or
quote-delimited strings. Equality is tested using ``==`` and
inequality by ``!=``. The operators ``and``, ``or`` and ``not`` are
used in the expected way. Parentheses can also be used for
grouping. For example::

  key:
    if (a == 2 or a == 3) and b == "abc": value1
    if a == 1 or b != "abc": value2
    value3

Here ``a`` and ``b`` are variables, the value of which will be
supplied when the manifest is used.

Expectation Manifests
---------------------

When used for expectation data, manifests have the following format:

 * A section per test URL described by the manifest, with the section
   heading being the part of the test URL following the last ``/`` in
   the path (this allows multiple tests in a single manifest file with
   the same path part of the URL, but different query parts).

 * A subsection per subtest, with the heading being the title of the
   subtest.

 * A key ``expected`` giving the expectation value or values of each 
   (sub)test.

 * A key ``disabled`` which can be set to any value to indicate that
   the (sub)test is disabled and should either not be run (for tests)
   or that its results should be ignored (subtests).

 * A key ``restart-after`` which can be set to any value to indicate that
   the runner should restart the browser after running this test (e.g. to
   clear out unwanted state).

 * A key ``fuzzy`` that is used for reftests. This is interpreted as a
   list containing entries like ``<meta name=fuzzy>`` content value,
   which consists of an optional reference identifier followed by a
   colon, then a range indicating the maximum permitted pixel
   difference per channel, then semicolon, then a range indicating the
   maximum permitted total number of differing pixels. The reference
   identifier is either a single relative URL, resolved against the
   base test URL, in which case the fuzziness applies to any
   comparison with that URL, or takes the form lhs url, comparison,
   rhs url, in which case the fuzziness only applies for any
   comparison involving that specific pair of URLs. Some illustrative
   examples are given below.

 * Variables ``debug``, ``os``, ``version``, ``processor`` and
   ``bits`` that describe the configuration of the browser under
   test. ``debug`` is a boolean indicating whether a build is a debug
   build. ``os`` is a string indicating the operating system, and
   ``version`` a string indicating the particular version of that
   operating system. ``processor`` is a string indicating the
   processor architecture and ``bits`` an integer indicating the
   number of bits. This information is typically provided by
   :py:mod:`mozinfo`.

 * Top level keys are taken as defaults for the whole file. So, for
   example, a top level key with ``expected: FAIL`` would indicate
   that all tests and subtests in the file are expected to fail,
   unless they have an ``expected`` key of their own.

An simple example manifest might look like::

  [test.html?variant=basic]
    type: testharness

    [Test something unsupported]
       expected: FAIL

    [Test with intermittent statuses]
       expected: [PASS, TIMEOUT]

  [test.html?variant=broken]
    expected: ERROR

  [test.html?variant=unstable]
    disabled: http://test.bugs.example.org/bugs/12345

A more complex manifest with conditional properties might be::

  [canvas_test.html]
    expected:
      if os == "osx": FAIL
      if os == "windows" and version == "XP": FAIL
      PASS

Note that ``PASS`` in the above works, but is unnecessary; ``PASS``
(or ``OK``) is always the default expectation for (sub)tests.

A manifest with fuzzy reftest values might be::

  [reftest.html]
    fuzzy: [10;200, ref1.html:20;200-300, subtest1.html==ref2.html:10-15;20]

In this case the default fuzziness for any comparison would be to
require a maximum difference per channel of less than or equal to 10
and less than or equal to 200 total pixels different. For any
comparison involving ref1.html on the right hand side, the limits
would instead be a difference per channel not more than 20 and a total
difference count of not less than 200 and not more than 300. For the
specific comparison subtest1.html == ref2.html (both resolved against
the test URL) these limits would instead be 10 to 15 and 0 to 20,
respectively.
