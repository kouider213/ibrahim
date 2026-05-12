import subprocess, os
env = dict(os.environ, NEXUS_HTTP_PORT='7779', NEXUS_WS_PORT='7780')
p = subprocess.Popen(
    [r'C:\Users\douba\AppData\Local\Python\pythoncore-3.14-64\python.exe', 'nexus.py'],
    cwd=r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus',
    env=env,
    creationflags=8,
    stdout=open(r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus\\nexus_restart.log', 'w'),
    stderr=open(r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus\\nexus_restart_err.log', 'w'),
)
print('NEWPID:' + str(p.pid))