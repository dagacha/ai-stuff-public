import threading

class Node:
    def __init__(self, key=0, value=0):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}  # maps key -> Node
        self.lock = threading.Lock()
        
        # Stats
        self.hits = 0
        self.misses = 0
        
        # Dummy head and tail for the doubly-linked list
        self.head = Node()
        self.tail = Node()
        self.head.next = self.tail
        self.tail.prev = self.head

    def _add_node(self, node: Node):
        """Always add the new node right after head."""
        node.prev = self.head
        node.next = self.head.next
        self.head.next.prev = node
        self.head.next = node

    def _remove_node(self, node: Node):
        """Remove an existing node from the linked list."""
        prev_node = node.prev
        next_node = node.next
        prev_node.next = next_node
        next_node.prev = prev_node

    def _move_to_front(self, node: Node):
        """Move a node to the front (most recently used position)."""
        self._remove_node(node)
        self._add_node(node)

    def _pop_tail(self) -> Node:
        """Pop the least recently used node."""
        res = self.tail.prev
        self._remove_node(res)
        return res

    def get(self, key: int):
        with self.lock:
            if key in self.cache:
                node = self.cache[key]
                self._move_to_front(node)
                self.hits += 1
                return node.value
            else:
                self.misses += 1
                return -1

    def put(self, key: int, value: int) -> None:
        with self.lock:
            if key in self.cache:
                node = self.cache[key]
                node.value = value
                self._move_to_front(node)
            else:
                new_node = Node(key, value)
                self.cache[key] = new_node
                self._add_node(new_node)
                
                if len(self.cache) > self.capacity:
                    tail_node = self._pop_tail()
                    if tail_node.key in self.cache:
                        del self.cache[tail_node.key]

    def get_stats(self) -> dict:
        with self.lock:
            total = self.hits + self.misses
            hit_rate = self.hits / total if total > 0 else 0.0
            return {
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": hit_rate
            }