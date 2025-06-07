# Competitive Programming Assistant (CPA) Extension

## Overview
The Competitive Programming Assistant (CPA) will be a VSCode extension that automates competitive programming workflows by:
1. Extracting problem details from programming competition websites
2. Generating ready-to-use C++ boilerplate code with integrated testing harness
3. Providing one-click test execution with performance metrics
4. Preparing submission-ready code

## Features

### 1. Problem Scanning
- Extracts problem descriptions, constraints, and sample test cases
- Parses input/output formats automatically
- Supports multiple test cases in a single file

### 2. Intelligent Boilerplate Generation
- **LLM-Powered Code Generation**:
  - Creates C++ templates with proper input handling
  - Generates empty `solve()` function with correct parameters
  - Includes problem constraints as comments
- **Smart Code Structure**:
  - Separation of concerns between solving logic and I/O handling
  - Conditional compilation for local testing vs online submission
  - Automatic inclusion of necessary standard library headers

### 3. Integrated Testing Environment
- **Local Test Execution**:
  - Runs code against sample test cases
  - Compares output with expected results
- **Performance Metrics**:
  - Execution time measurement (milliseconds)
  - Memory usage tracking (KB)
  - Per-test case statistics

### 4. File Management
- Automatic creation of:
  - `.cpp` solution file
  - `input.txt` with sample test cases
  - `output.txt` with expected results
- Configurable save directory
- One-click access to generated files

### 5. Submission Preparation
- Generates cleaned-up code without testing artifacts
- Maintains `ONLINE_JUDGE` compatibility
- Preserves only essential code for submission

## Workflow

1. **Problem Extraction**  
   Activate extension on problem page → Scrape problem details → Save to local files

2. **Boilerplate Generation**  
   Send problem details to LLM → Generate C++ template → Create files in workspace

3. **Solution Development**  
   Implement logic in `solve()` function → Use VSCode for editing

4. **Local Testing**  
   Run tests through extension → View results and metrics → Debug failures

5. **Submission**  
   Generate cleaned code → Submit to online judge

## Sample Output

### Generated C++ File
```cpp
#include <iostream>
#include <vector>

#ifndef ONLINE_JUDGE
  #include <string>
  #include <sstream>
  #include <fstream>
  #include <iterator>
  #include <chrono>
  #include <sys/resource.h>
  #include <cstdio>
#endif

using namespace std;

/*
Problem: A. Halloumi Boxes
Constraints:
  - t: 1-100 test cases
  - n, k: 1 ≤ k ≤ n ≤ 100
  - Values: 1 ≤ a_i ≤ 10^9
*/

bool solve(const vector<int> &arr, int k) {
    // YOUR SOLUTION HERE
    
}

int main(){
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

#ifndef ONLINE_JUDGE
    // Local testing harness
    if (!freopen("input.txt", "r", stdin)) {
        cerr << "Cannot open input.txt\n";
        return 1;
    }

    int Tlocal;
    if (!(cin >> Tlocal)) return 0;

    ostringstream oss;
    vector<long long> times_ms(Tlocal), mem_kb(Tlocal);

    for (int i = 0; i < Tlocal; i++) {
        int n, k;
        cin >> n >> k;
        vector<int> arr(n);
        for (int j = 0; j < n; j++) 
            cin >> arr[j];

        auto t0 = chrono::high_resolution_clock::now();
        bool ans = solve(arr, k);
        auto t1 = chrono::high_resolution_clock::now();
        times_ms[i] = chrono::duration_cast<chrono::milliseconds>(t1 - t0).count();

        struct rusage usage;
        getrusage(RUSAGE_SELF, &usage);
        mem_kb[i] = usage.ru_maxrss;

        oss << (ans ? "YES\n" : "NO\n");
    }

    string output = oss.str();
    ifstream exp("output.txt");
    if (exp) {
        string expected((istreambuf_iterator<char>(exp)),
                         istreambuf_iterator<char>());

        if (expected == output) {
            for (int i = 0; i < Tlocal; i++) {
                cout << "Test #" << (i+1)
                     << ": " << times_ms[i] << " ms, "
                     << mem_kb[i]   << " KB\n";
            }
        } else {
            cout << "False\n";
        }
        return 0;
    }

    cout << output;
    return 0;
#endif

    // Online judge execution
    int t;
    cin >> t;
    while (t--) {
        int n, k;
        cin >> n >> k;
        vector<int> arr(n);
        for (int i = 0; i < n; i++)
            cin >> arr[i];

        cout << (solve(arr, k) ? "YES\n" : "NO\n");
    }
    return 0;
}
```

### Test Case Files
**input.txt**
```
5
3 2
1 2 3
3 1
9 9 9
4 4
6 4 2 1
4 3
10 3 830 14
2 1
3 1
```

**output.txt**
```
YES
YES
YES
YES
NO
```

## Ethical Considerations
- LLM generates only boilerplate - solution logic must be implemented by user
- Avoids potential plagiarism by keeping `solve()` function empty
- Educational focus on proper problem-solving techniques