---
title: "Operators"
sidebar_position: 4
---

## Deep Dive into Operators

### Video Outline:
1. Introduction to Operators
2. Arithmetic Operators
   - Addition
   - Subtraction
   - Multiplication
   - Division
   - Floor Division
   - Modulus
   - Exponentiation
3. Comparison Operators
   - Equal to
   - Not equal to
   - Greater than
   - Less than
   - Greater than or equal to 
   - Less than or equal to
4. Logical Operators
   - AND
   - OR
   - NOT
5. Practical Examples and Common Errors

```python
## Arithmethic Operation

a=10
b = 5

add_result=a+b  #addiiton
sub_result=a-b  #substraction 
mult_result=a*b #multiplication
div_result=a/b  #division
floor_div_result=a//b ## floor division
modulus_result=a%b #modulus operation

exponent_result=a**b ## Exponentiation


print(add_result)
print(sub_result)
print(mult_result)
print(div_result)
print(floor_div_result)
print(modulus_result)
print(exponent_result)
```

```python
10/5
```

```python
21/5
```

```python
21//5
```

#### Comparison Operators

```python
## Comparison Operators
## == Equal to
a=10
b=10

a==b
```

```python
str1="Krish"
str2="Krish"

str1==str2
```

```python
## Not Equal to !=
str1!=str2
```

```python
str3="Krish"
str4="krish"

str3!=str4
```

```python
# greater than >

num1=45
num2=55

num1>num2
```

```python
## less than <

print(num1<num2)
```

```python
#greater than or equal to
number1=45
number2=45

print(number1>=number2)
```

```python
#less than or equal to
number1=44
number2=45

print(number1<=number2)
```

#### Logical Operators

```python
## And ,Not,OR
X=True
Y=True

result =X and Y
print(result)
```

```python
X=False
Y=True

result =X and Y
print(result)
```

```python
## OR
X=False
Y=False

result =X or Y
print(result)
```

```python
# Not operator
X=False
not X
```

```python
## Simple Calculator

# Simple calculator
num1 = float(input("Enter first number: "))
num2 = float(input("Enter second number: "))

# Performing arithmetic operations
addition = num1 + num2
subtraction = num1 - num2
multiplication = num1 * num2
division = num1 / num2
floor_division = num1 // num2
modulus = num1 % num2
exponentiation = num1 ** num2

# Displaying results
print("Addition:", addition)
print("Subtraction:", subtraction)
print("Multiplication:", multiplication)
print("Division:", division)
print("Floor Division:", floor_division)
print("Modulus:", modulus)
print("Exponentiation:", exponentiation)
```
