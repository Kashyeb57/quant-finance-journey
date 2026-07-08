---
title: Python
---

# Python

My working notes for Python, following the Complete Python Bootcamp.

> **Progress so far:** Basics → Control Flow → Data Structures → **Functions** ✅
> _Last updated: 8 Jul 2026_

---

## 1. Python Basics

### Syntax & Semantics

**Syntax** = the rules for how code must be arranged. **Semantics** = what the code actually *means* / does when it runs.

- Python is **case sensitive** (`name` and `Name` are different variables).
- Blocks are defined by **indentation** (usually 4 spaces), not braces `{}`.
- `#` starts a single-line comment.
- Use `\` to continue a statement onto the next line.
- Separate multiple statements on one line with `;`.

```python
# Case sensitivity
name = "Krish"
Name = "Naik"
print(name)   # Krish
print(Name)   # Naik

# Indentation defines the block
age = 32
if age > 30:
    print(age)      # inside the if
print(age)          # outside the if

# Line continuation
total = 1 + 2 + 3 + \
        4 + 5
# Multiple statements on one line
x = 5; y = 10; z = x + y
```

**Gotcha:** referencing a variable that was never assigned raises a `NameError`.

### Variables

Variables are created the moment you assign to them — no separate declaration needed.

- Names must start with a letter or `_`, and contain only letters, numbers, `_`.
- Python is **dynamically typed** — a variable's type is decided at runtime and can change.

```python
age = 32          # int
height = 6.1      # float
name = "Krish"    # str
is_student = True # bool

print(type(name)) # <class 'str'>

# Type conversion
age = 25
age_str = str(age)      # "25"
back_to_int = int("25") # 25

# Dynamic typing — same variable, different types
var = 10
var = "Hello"
var = 3.14

# Reading input (input() always returns a string)
age = int(input("What is the age? "))
```

### Data Types

Data types tell the interpreter how you intend to use a value and which operations are allowed.

| Type | Example |
|------|---------|
| `int` | `35` |
| `float` | `5.11` |
| `str` | `"Krish"` |
| `bool` | `True` |

```python
result = "Hello" + 5        # ❌ TypeError: can't add str + int
result = "Hello" + str(5)   # ✅ "Hello5"
```

### Operators

**Arithmetic:** `+  -  *  /  //  %  **`

```python
a, b = 10, 5
a + b     # 15
a - b     # 5
a * b     # 50
a / b     # 2.0  (division always returns float)
a // b    # 2    (floor division)
a % b     # 0    (modulus / remainder)
a ** b    # 100000 (exponent)
```

**Comparison** (`==  !=  >  <  >=  <=`) returns a `bool`.
**Logical:** `and`, `or`, `not`.

```python
X, Y = True, False
X and Y   # False
X or Y    # True
not X     # False
```

---

## 2. Control Flow

### Conditional Statements — `if` / `elif` / `else`

```python
age = 17
if age < 13:
    print("You are a child")
elif age < 18:
    print("You are a teenager")
else:
    print("You are an adult")
```

Conditions can be **nested**. Example — leap year check:

```python
year = int(input("Enter the year: "))
if year % 4 == 0:
    if year % 100 == 0:
        if year % 400 == 0:
            print(year, "is a leap year")
        else:
            print(year, "is not a leap year")
    else:
        print(year, "is a leap year")
else:
    print(year, "is not a leap year")
```

### Loops

**`for`** loops iterate over a sequence; `range(start, stop, step)` generates numbers.

```python
for i in range(5):        # 0,1,2,3,4
    print(i)

for i in range(1, 10, 2): # 1,3,5,7,9
    print(i)

for i in range(10, 1, -1): # counting down
    print(i)

for ch in "Krish":        # iterate a string
    print(ch)
```

**`while`** loops run while a condition stays true.

```python
count = 0
while count < 5:
    print(count)
    count += 1
```

**Loop control:** `break` (exit early), `continue` (skip to next iteration), `pass` (do nothing / placeholder).

```python
for i in range(10):
    if i == 5:
        break        # stops at 5
    print(i)

for i in range(10):
    if i % 2 == 0:
        continue     # skips even numbers
    print(i)
```

Nested loops and a classic example — printing primes 1–100:

```python
for num in range(1, 101):
    if num > 1:
        for i in range(2, num):
            if num % i == 0:
                break
        else:            # runs only if the inner loop didn't break
            print(num)
```

---

## 3. Data Structures

### Lists — ordered, mutable, mixed types

```python
fruits = ["apple", "banana", "cherry", "kiwi"]
fruits[0]      # "apple"
fruits[-1]     # "kiwi" (last)
fruits[1:3]    # ["banana", "cherry"] (slice)

fruits[1] = "watermelon"   # lists are mutable
```

**Common methods:** `append`, `insert`, `remove`, `pop`, `index`, `count`, `sort`, `reverse`, `clear`.

```python
fruits.append("orange")    # add to end
fruits.insert(1, "mango")  # insert at index
fruits.remove("banana")    # remove first match
last = fruits.pop()        # remove & return last
fruits.sort()              # ascending order
fruits.reverse()
```

**Slicing tricks:**

```python
numbers = [1,2,3,4,5,6,7,8,9,10]
numbers[::2]   # every 2nd -> [1,3,5,7,9]
numbers[::-1]  # reversed
```

**List comprehensions** — compact way to build lists:

```python
squares = [x**2 for x in range(10)]
evens = [x for x in range(10) if x % 2 == 0]
pairs = [[i, j] for i in [1,2] for j in ['a','b']]  # nested
```

`enumerate` gives index + value while looping:

```python
for index, number in enumerate(numbers):
    print(index, number)
```

### Tuples — ordered but **immutable**

```python
numbers = (1, 2, 3, 4, 5)
numbers[0]      # 1
# numbers[0] = 9   ❌ TypeError — tuples can't be changed

# Packing & unpacking
packed = 1, "Hello", 3.14
a, b, c = packed

# Unpacking with *
first, *middle, last = (1, 2, 3, 4, 5)  # first=1, middle=[2,3,4], last=5

# Methods
numbers.count(1)   # how many 1s
numbers.index(3)   # position of 3
```

### Sets — unordered collections of **unique** items

```python
my_set = {1, 2, 3, 4, 5}
my_set.add(7)
my_set.remove(3)     # errors if missing
my_set.discard(11)   # safe if missing
print(3 in my_set)   # membership test

# Math operations
set1 = {1,2,3,4,5,6}
set2 = {4,5,6,7,8,9}
set1.union(set2)                # all elements
set1.intersection(set2)         # common
set1.difference(set2)           # in set1 not set2
set1.symmetric_difference(set2) # in one but not both

# Handy: get unique items from a list
unique = set([1,2,2,3,4,4,5])   # {1,2,3,4,5}
```

### Dictionaries — key–value pairs

Keys are unique and immutable; values can be anything.

```python
student = {"name": "Krish", "age": 32, "grade": "A"}
student["grade"]              # "A"
student.get("last_name", "N/A")  # safe access with default

# Modify
student["age"] = 33           # update
student["address"] = "India"  # add
del student["grade"]          # delete

# Views
student.keys()
student.values()
student.items()

# Iterate
for key, value in student.items():
    print(f"{key}: {value}")
```

**Nested dictionaries, comprehensions, and merging:**

```python
students = {
    "s1": {"name": "Krish", "age": 32},
    "s2": {"name": "Peter", "age": 35},
}
print(students["s2"]["name"])   # Peter

squares = {x: x**2 for x in range(5)}       # comprehension
merged = {**{"a": 1}, **{"b": 2}}           # merge two dicts
```

Counting frequency of items — a very common pattern:

```python
numbers = [1,2,2,3,3,3,4,4,4,4]
frequency = {}
for n in numbers:
    frequency[n] = frequency.get(n, 0) + 1
# {1:1, 2:2, 3:3, 4:4}
```

---

## 4. Functions

A function is a reusable block of code that performs a specific task — it keeps code organized and readable.

```python
def function_name(parameters):
    """Docstring describing the function."""
    # body
    return expression
```

```python
def even_or_odd(num):
    """Check whether a number is even or odd."""
    if num % 2 == 0:
        print("even")
    else:
        print("odd")

def add(a, b):
    return a + b
```

**Default parameters** — used when no argument is passed:

```python
def greet(name="Guest"):
    print(f"Hello {name}, welcome!")

greet()          # Hello Guest, welcome!
greet("Krish")   # Hello Krish, welcome!
```

**Variable-length arguments** — `*args` (positional) and `**kwargs` (keyword):

```python
def print_numbers(*args):
    for n in args:
        print(n)

def print_details(**kwargs):
    for key, value in kwargs.items():
        print(f"{key}: {value}")

print_details(name="Krish", age=32, country="India")
```

**Return** — functions can return a value, or multiple values as a tuple:

```python
def multiply(a, b):
    return a * b, a      # returns (product, a)
```

### Lambda functions

Small anonymous functions: `lambda args: expression`. Good for short throwaway logic.

```python
add = lambda a, b: a + b
add(5, 6)                 # 11

is_even = lambda num: num % 2 == 0
is_even(12)               # True
```

### `map()` — apply a function to every item

```python
numbers = [1, 2, 3, 4, 5]
list(map(lambda x: x**2, numbers))   # [1,4,9,16,25]

# Multiple iterables
list(map(lambda x, y: x + y, [1,2,3], [4,5,6]))  # [5,7,9]

# Convert strings to ints
list(map(int, ["1", "2", "3"]))      # [1,2,3]
```

### `filter()` — keep only items that pass a condition

```python
numbers = [1,2,3,4,5,6,7,8,9]
list(filter(lambda x: x > 5, numbers))              # [6,7,8,9]
list(filter(lambda x: x > 5 and x % 2 == 0, numbers))  # [6,8]
```

---

> **Next up:** Modules → File Handling → Exception Handling → OOP (Classes & Objects).
