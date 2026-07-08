---
title: "Loops"
sidebar_position: 2
---

#### Loops
Video Outline:
1. Introduction to Loops
2. for Loop
   - Iterating over a range
   - Iterating over a string

3. while Loop
4. Loop Control Statements
    - break
    - continue
    - pass
5. Nested Loops
6. Practical Examples and Common Errors

```python
range(5)
```

```python
## for loop

for i in range(5):
    print(i)
```

```python
for i in range(1,6):
    print(i)
```

```python
for i in range(1,10,2):
    print(i)
```

```python
for i in range(10,1,-1):
    print(i)
```

```python
for i in range(10,1,-2):
    print(i)
```

```python
## strings

str="Krish Naik"

for i in str:
    print(i)
```

```python
## while loop

## The while loop continues to execute as long as the condition is True.

count=0

while count<5:
    print(count)
    count=count+1
```

```python
## Loop Control Statements

## break
## The break statement exits the loop permaturely

## break sstatement

for i in range(10):
    if i==5:
        break
    print(i)
   
```

```python
## continue

## The continue statement skips the current iteration and continues with the next.

for i in range(10):
    if i%2==0:
        continue
    print(i)
```

```python
## pass
## The pass statement is a null operation; it does nothing.

for i in range(5):
    if i==3:
        pass
    print(i)
```

```python
## Nested loopss
## a loop inside a loop

for i in range(3):
    for j in range(2):
        print(f"i:{i} and j:{j}")
```

```python
## Examples- Calculate the sum of first N natural numbers using a while and for loop

## while loop  

n=10   
sum=0
count=1

while count<=n:
    sum=sum+count
    count=count+1

print("Sum of first 10 natural number:",sum)
```

```python
n=10   
sum=0
for i in range(11):
    sum=sum+i

print(sum)
```

```python
## Example- Prime numbers between 1 and 100

for num in range(1,101):
    if num>1:
        for i in range(2,num):
            if num%i==0:
                break
        else:
            print(num)
```

#### Conclusion:
Loops are powerful constructs in Python that allow you to execute a block of code multiple times. By understanding and using for and while loops, along with loop control statements like break, continue, and pass, you can handle a wide range of programming tasks efficiently.
