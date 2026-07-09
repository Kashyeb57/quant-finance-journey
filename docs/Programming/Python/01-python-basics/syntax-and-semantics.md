---
title: "Syntax & Semantics"
sidebar_position: 1
---

### Syntax and Semantics in Python
Video Outline:
- Single line Comments and multiline comments 
- Definition of Syntax and Semantics
- Basic Syntax Rules in Python
- Understanding Semantics in Python
- Common Syntax Errors and How to Avoid Them
- Practical Code Examples

Syntax refers to the set of rules that defines the combinations of symbols that are considered to be correctly structured programs in a language. In simpler terms, syntax is about the correct arrangement of words and symbols in a code.

Semantics refers to the meaning or the interpretation of the symbols, characters, and commands in a language. It is about what the code is supposed to do when it runs.

```python
## Basic Syntax Rules In Python
## Case sensitivity- Python is case sensitive

name="Joyeb"
Name="Kashyeb"

print(name)
print(Name)
```

*Output:*

```text
Joyeb
Kashyeb
```

### Indentation
Indentation in Python is used to define the structure and hierarchy of the code. Unlike many other programming languages that use braces {} to delimit blocks of code, Python uses indentation to determine the grouping of statements. This means that all the statements within a block must be indented at the same level.

```python
## Indentation
## Python uses indentation to define blocks of code. Consistent use of spaces (commonly 4) or a tab is required.

age=32
if age>30:
    
    print(age)
    
print(age)
```

*Output:*

```text
32
32
```

```python
## This is a single line comment
print("Hello World")
```

*Output:*

```text
Hello World
```

```python
## Line Continuation
##Use a backslash (\) to continue a statement to the next line

total=1+2+3+4+5+6+7+\
4+5+6

print(total)
```

*Output:*

```text
43
```

```python
## Multiple Statements on a single line
x=5;y=10;z=x+y
print(z)
```

*Output:*

```text
15
```

```python
##Understand  Semnatics In Python
# variable assignment
age=32 ##age is an integer
name="Joyeb" ##name is a string
```

```python


type(age)
```

*Output:*

```text
int
```

```python
type(name)
```

*Output:*

```text
str
```

```python
## Type Inference
variable=10
print(type(variable))
variable="Joyeb"
print(type(variable))
```

*Output:*

```text
<class 'int'>
<class 'str'>
```

```python
age=32
if age>30:
    print(age)
```

*Output:*

```text
32
```

```python
## Name Error
a=b
```

*Output:*

```text
NameError: name 'b' is not defined
```

```python
## Code exmaples of indentation
if True:
    print("Correct Indentation")
    if False:
        print("This ont print")
    print("This will print")
print("Outside the if block")
```

*Output:*

```text
Correct Indentation
This will print
Outside the if block
```

### Conclusion:
Understanding the syntax and semantics of Python is crucial for writing correct and meaningful programs. Syntax ensures the code is properly structured, while semantics ensures the code behaves as expected. Mastering these concepts will help in writing efficient and error-free Python code.
