---
title: "Lambda Functions"
sidebar_position: 3
---

##### Lambda Functions in Python
Lambda functions are small anonymous functions defined using the **lambda** keyword. They can have any number of arguments but only one expression. They are commonly used for short operations or as arguments to higher-order functions.

```python
#Syntax
lambda arguments: expression
```

```python
def addition(a,b):
    return a+b
```

```python
addition(2,3)
```

*Output:*

```text
5
```

```python
addition=lambda a,b:a+b
type(addition)
print(addition(5,6))
```

*Output:*

```text
11
```

```python
def even(num):
    if num%2==0:
        return True
    
even(24)
```

*Output:*

```text
True
```

```python
even1=lambda num:num%2==0
even1(12)
```

*Output:*

```text
True
```

```python
def addition(x,y,z):
    return x+y+z

addition(12,13,14)
```

*Output:*

```text
39
```

```python
addition1=lambda x,y,z:x+y+z
addition1(12,13,14)
```

*Output:*

```text
39
```

```python
## map()- applies a function to all items in a list
numbers=[1,2,3,4,5,6]
def square(number):
    return number**2

square(2)
```

*Output:*

```text
4
```

```python
list(map(lambda x:x**2,numbers))
```

*Output:*

```text
[1, 4, 9, 16, 25, 36]
```
