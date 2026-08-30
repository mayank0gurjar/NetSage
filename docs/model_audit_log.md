# NetSage AI - Responsible AI Audit Log

This audit log records the agreement metrics, manual revisions, and human oversight decisions.

## Performance Metrics
- **Current Agreement Rate**: 41.7% (Updated)
- **Total Cases Reviewed**: 12

## Audit Entries

| Timestamp | Case ID | Diagnosis Source | Severity | Decision | Original CLI Command | Final CLI Command | Override Reason |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-08-20T10:15:30Z | NET-002 | llm | High | Edited | `configure terminal\ninterface Fa0/2` | `configure terminal\nip dhcp pool LAN_POOL\nnetwork 192.168.1.0 255.255.255.0` | AI suggested configuring host interface but root cause was DHCP scope exhaustion. |
| 2026-08-20T11:22:45Z | NET-005 | llm | Medium | Edited | `configure terminal\nno access-list 101` | `configure terminal\ninterface Gi0/0\nno ip access-group 101 in` | AI tried to delete the entire ACL, but it is better security practice to just remove the access-group binding. |
| 2026-08-20T14:40:12Z | NET-015 | llm | High | Edited | `configure terminal\nip route 172.16.0.0 255.255.0.0 10.0.0.5` | `configure terminal\nno ip route 172.16.0.0 255.255.0.0 10.0.0.5\nip route 172.16.0.0 255.255.0.0 10.0.0.2` | AI omitted deleting the old broken static route with the incorrect next-hop IP. |
| 2026-08-21T09:05:00Z | NET-023 | llm | High | Edited | `configure terminal\ninterface Fa0/1\nip address 192.168.1.100` | `# Change host static IP\nconfigure terminal\ninterface Fa0/1\nip address 192.168.1.101 255.255.255.0` | AI suggested setting the duplicate IP instead of resolving it with a new unique IP. |
| 2026-08-21T10:30:15Z | NET-026 | llm | Medium | Edited | `configure terminal\ninterface Fa0/10\nno switchport port-security` | `configure terminal\ninterface FastEthernet0/10\nshutdown\nno shutdown` | AI disabled port security entirely, whereas the correct fix is to reset the err-disabled port (shutdown / no shutdown). |
| 2026-08-21T06:57:28.017Z | NET-001 | rule_checker | High | accepted | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | Interface GigabitEthernet0/0.10 needs to be enabled |
| 2026-08-21T09:28:18.573Z | NET-003 | llm | Medium | accepted | `configure terminal\nip domain-lookup` | `configure terminal\nip domain-lookup` | Approved as suggested. |
| 2026-08-21T09:48:58.557Z | NET-003 | llm | Medium | accepted | `configure terminal\nno ip name-server 192.168.1.5\nip name-server 8.8.8.8\nend\n! Note: PC1's static DNS configuration must also be updated to a working DNS server (e.g., 8.8.8.8) or if using DHCP, the DHCP pool must be updated.` | `configure terminal\nno ip name-server 192.168.1.5\nip name-server 8.8.8.8\nend\n! Note: PC1's static DNS configuration must also be updated to a working DNS server (e.g., 8.8.8.8) or if using DHCP, the DHCP pool must be updated.` | Approved as suggested. |
| 2026-08-21T09:49:03.013Z | NET-001 | rule_checker | High | accepted | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | Approved as suggested. |
| 2026-08-24T15:47:18.803Z | NET-001 | rule_checker | High | edited | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | `! Modified by Human Reviewer\nconfigure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | Verified interface is shut down, approving the fix script. |
| 2026-08-24T15:55:30.583Z | NET-001 | rule_checker | High | accepted | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | Approved as suggested. |
| 2026-08-24T15:55:40.519Z | NET-001 | rule_checker | High | edited | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | `configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown` | No comments provided. |
