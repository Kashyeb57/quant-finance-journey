---
title: "Variables"
sidebar_position: 2
---

### Variables
Variables are fundamental elements in programming used to store data that can be referenced and manipulated in a program. In Python, variables are created when you assign a value to them, and they do not need explicit declaration to reserve memory space. The declaration happens automatically when you assign a value to a variable.

Video Outline:
- Introduction to Variables
- Declaring and Assigning Variables
- Naming Conventions
- Understanding Variable Types
- Type Checking and Conversion
- Dynamic Typing
- Practical Examples and Common Errors

```python
a=100
```

```python
## Declaring And Assigning Variables

age=32
height=6.1
name="Krish"
is_student=True

## printing the variables

print("age :",age)
print("Height:",height)
print("Name:",name)
```

*Output:*

```text
age : 32
Height: 6.1
Name: Krish
```

```python
## Naming Conventions
## Variable names should be descriptive
## They must start with a letter or an '_' and contains letter,numbers and underscores
## variables names case sensitive

#valid variable names

first_name="KRish"
last_name="Naik"
```

```python
# Invalid variable names
#2age=30
#first-name="Krish"
##@name="Krish"
```

*Output:*

```text
SyntaxError: invalid syntax. Maybe you meant '==' or ':=' instead of '='? (1710987940.py, line 4)
```

```python
## case sensitivity
name="Krish"
Name="Naik"
```

*Output:*

```text
False
```

```python
## Understnading Variable types
## Python is dynamically typed,type of a variable is determined at runtime
age=25 #int
height=6.1 #float
name="KRish" #str
is_student=True #bool

print(type(name))
```

*Output:*

```text
<class 'str'>
```

```python
## Type Checking and Conversion

type(height)
```

*Output:*

```text
float
```

```python
age=25
print(type(age))

# Type conversion
age_str=str(age)
print(age_str)
print(type(age_str))
```

*Output:*

```text
<class 'int'>
25
<class 'str'>
```

```python
age='25'
print(type(int(age)))
```

*Output:*

```text
<class 'int'>
```

```python
name="Krish"
int(name)
```

*Output:*

```text
ValueError: invalid literal for int() with base 10: 'Krish'
```

```python
height=5.11
type(height)
```

*Output:*

```text
float
```

```python
float(int(height))
```

*Output:*

```text
5.0
```

```python
## Dynamic Typing
## Python allows the type of a vraible to change as the program executes
var=10 #int
print(var,type(var))

var="Hello"
print(var,type(var))

var=3.14
print(var,type(var))
```

*Output:*

```text
10 <class 'int'>
Hello <class 'str'>
3.14 <class 'float'>
```

```python
## input

age=int(input("What is the age"))
print(age,type(age))
```

*Output:*

```text
23 <class 'int'>
```

```python
### Simple calculator
num1 = float(input("Enter first number: "))
num2 = float(input("Enter second number: "))

sum = num1 + num2
difference = num1 - num2
product = num1 * num2
quotient = num1 / num2

print("Sum:", sum)
print("Difference:", difference)
print("Product:", product)
print("Quotient:", quotient)
```

*Output:*

```text
Sum: 66.0
Difference: 46.0
Product: 560.0
Quotient: 5.6
```

### Conclusion:
Variables are essential in Python programming for storing and manipulating data. Understanding how to declare, assign, and use variables effectively is crucial for writing functional and efficient code. Following proper naming conventions and understanding variable types will help in maintaining readability and consistency in your code.
