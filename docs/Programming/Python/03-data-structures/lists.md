---
title: "Lists"
sidebar_position: 1
---

#### Introduction To Lists
- Lists are ordered, mutable collections of items.
- They can contain items of different data types.

##### Video Outline:
1. Introduction to Lists
2. Creating Lists
3. Accessing List Elements
4. Modifying List Elements
5. List Methods
6. Slicing Lists
7. Iterating Over Lists
8. List Comprehensions
9. Nested Lists
10. Practical Examples and Common Errors

```python
lst=[]
print(type(lst))
```

```python
names=["Krish","Jack","Jacob",1,2,3,4,5]
print(names)
```

```python
mixed_list=[1,"Hello",3.14,True]
print(mixed_list)
```

```python
### Accessing List Elements

fruits=["apple","banana","cherry","kiwi","gauva"]
```

```python
print(fruits[0])
print(fruits[2])
print(fruits[4])
print(fruits[-1])
```

```python
print(fruits[1:])
print(fruits[1:3])
```

```python
## Modifying The List elements
fruits
```

```python
fruits[1]="watermelon"
print(fruits)
```

```python
fruits[1:]="watermelon"
```

```python
fruits
```

```python
fruits=["apple","banana","cherry","kiwi","gauva"]
```

```python
## List Methods

fruits.append("orange") ## Add an item to the end
print(fruits)
```

```python
fruits.insert(1,"watermelon")
print(fruits)
```

```python
fruits.remove("banana") ## Removing the first occurance of an item
print(fruits)
```

```python
## Remove and return the last element
popped_fruits=fruits.pop()
print(popped_fruits)
print(fruits)
```

```python
index=fruits.index("cherry")
print(index)
```

```python
fruits.insert(2,"banana")
print(fruits.count("banana"))
```

```python
fruits
```

```python
fruits.sort() ## SSorts the list in ascending order
```

```python
fruits
```

```python
fruits.reverse() ## REverse the list
```

```python
fruits
```

```python
fruits.clear() ## Remove all items from the list

print(fruits)
```

```python
## Slicing List
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
print(numbers[2:5])
print(numbers[:5])
print(numbers[5:])
print(numbers[::2])
print(numbers[::-1])
```

```python
numbers[::3]
```

```python
numbers[::-2]
```

```python
### Iterating Over List

for number in numbers:
    print(number)
```

```python
## Iterating with index
for index,number in enumerate(numbers):
    print(index,number)
```

```python
## List comprehension
lst=[]
for x in range(10):
    lst.append(x**2)

print(lst)
```

```python
[x**2 for x in range(10)]
```

##### List Comprehension

Basics Syantax            [expression for item in iterable]

with conditional logic    [expression for item in iterable if condition]

Nested List Comprehension [expression for item1 in iterable1 for item2 in iterable2]

```python
### Basic List Comphrension

sqaure=[num**2 for num in range(10)]
print(sqaure)
```

```python
### List Comprehension with Condition
lst=[]
for i in range(10):
    if i%2==0:
        lst.append(i)

print(lst)
        
```

```python
even_numbers=[num for num in range(10) if num%2==0]
print(even_numbers)
```

```python
## Nested List Comphrension

lst1=[1,2,3,4]
lst2=['a','b','c','d']

pair=[[i,j] for i in lst1 for j in lst2]

print(pair)
```

```python
## List Comprehension with function calls
words = ["hello", "world", "python", "list", "comprehension"]
lengths = [len(word) for word in words]
print(lengths)  # Output: [5, 5, 6, 4, 13]
```

#### Conclusion
List comprehensions are a powerful and concise way to create lists in Python. They are syntactically compact and can replace more verbose looping constructs. Understanding the syntax of list comprehensions will help you write cleaner and more efficient Python code.
