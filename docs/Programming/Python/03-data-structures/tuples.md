---
title: "Tuples"
sidebar_position: 3
---

#### Tuples
Video Outline:
1. Introduction to Tuples
2. Creating Tuples
3. Accessing Tuple Elements
4. Tuple Operations
5. Immutable Nature of Tuples
6. Tuple Methods
7. Packing and Unpacking Tuples
8. Nested Tuples
9. Practical Examples and Common Errors


##### Introduction to Tuples
Explanation:

Tuples are ordered collections of items that are immutable.
They are similar to lists, but their immutability makes them different.

```python
## creating a tuple
empty_tuple=()
print(empty_tuple)
print(type(empty_tuple))
```

```python
lst=list()
print(type(lst))
tpl=tuple()
print(type(tpl))
```

```python
numbers=tuple([1,2,3,4,5,6])
numbers
```

```python
list((1,2,3,4,5,6))
```

```python
mixed_tuple=(1,"Hello World",3.14, True)
print(mixed_tuple)
```

```python
## Accessing Tuple Elements

numbers
```

```python
print(numbers[2])
print(numbers[-1])
```

```python
numbers[0:4]
```

```python
numbers[::-1]
```

```python
## Tuple Operations

concatenation_tuple=numbers + mixed_tuple
print(concatenation_tuple)
```

```python
mixed_tuple * 3
```

```python
numbers *3
```

```python
## Immutable Nature Of Tuples
## Tuples are immutable, meaning their elements cannot be changed once assigned.

lst=[1,2,3,4,5]
print(lst)

lst[1]="Krish"
print(lst)
```

```python
numbers[1]="Krish"
```

```python
numbers
```

```python
## Tuple Methods
print(numbers.count(1))
print(numbers.index(3))
```

```python
## Packing and Unpacking tuple
## packing
packed_tuple=1,"Hello",3.14
print(packed_tuple)
```

```python
##unpacking a tuple
a,b,c=packed_tuple

print(a)
print(b)
print(c)
```

```python
## Unpacking with *
numbers=(1,2,3,4,5,6)
first,*middle,last=numbers
print(first)
print(middle)
print(last)
```

```python
## Nested Tuple
## Nested List
lst=[[1,2,3,4],[6,7,8,9],[1,"Hello",3.14,"c"]]
lst[0][0:3]
```

```python
lst=[[1,2,3,4],[6,7,8,9],(1,"Hello",3.14,"c")]
lst[2][0:3]
```

```python
nested_tuple = ((1, 2, 3), ("a", "b", "c"), (True, False))

## access the elements inside a tuple
print(nested_tuple[0])
print(nested_tuple[1][2])
```

```python
## iterating over nested tuples
for sub_tuple in nested_tuple:
    for item in sub_tuple:
        print(item,end=" ")
    print()
```

#### Conclusion
Tuples are versatile and useful in many real-world scenarios where an immutable and ordered collection of items is required. They are commonly used in data structures, function arguments and return values, and as dictionary keys. Understanding how to leverage tuples effectively can improve the efficiency and readability of your Python code.
