#!/usr/bin/env python3
# mod 技能示例：python3 ping.py [参数...]
import sys, socket, datetime
print("mod 技能通道正常")
print("host:", socket.gethostname())
print("time:", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
if len(sys.argv) > 1:
    print("参数:", " ".join(sys.argv[1:]))
