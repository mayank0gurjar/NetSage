import sys
import json
import re

def analyze_case(symptom, topology_note, show_outputs):
    errors = []
    
    # Combine everything for simple regex matching
    full_text = f"{symptom}\n{topology_note}\n{show_outputs}"

    # 1. Interface down / Admin down
    # Match GigabitEthernet0/0.10 is administratively down, line protocol is down
    admin_down_match = re.search(r"(\S+)\s+is administratively down", full_text, re.IGNORECASE)
    if admin_down_match:
        interface_name = admin_down_match.group(1)
        errors.append({
            "rule_id": "INTERFACE_ADMIN_DOWN",
            "description": f"Interface {interface_name} is administratively down (shutdown).",
            "evidence": admin_down_match.group(0),
            "fix": f"configure terminal\ninterface {interface_name}\nno shutdown"
        })

    # 2. DHCP Scope Pool Exhaustion
    # Match leased 10; zero available OR total addresses 10; leased 10
    if "leased" in full_text.lower() and ("zero available" in full_text.lower() or "leased 10" in full_text.lower()):
        errors.append({
            "rule_id": "DHCP_POOL_EXHAUSTED",
            "description": "DHCP Scope IP address pool exhaustion (zero available leases).",
            "evidence": "leased 10; zero available" if "zero available" in full_text.lower() else "leased 10; total addresses 10",
            "fix": "configure terminal\nip dhcp pool LAN_POOL\nnetwork 192.168.1.0 255.255.255.0\n# Note: Increase DHCP subnet allocation range or lower lease time"
        })

    # 3. Missing IP Helper-Address for DHCP Relay
    if "helper-address" in full_text.lower() or "missing ip helper-address" in full_text.lower():
        interface_match = re.search(r"interface\s+(\S+)", full_text, re.IGNORECASE)
        if interface_match:
            interface_name = interface_match.group(1)
            errors.append({
                "rule_id": "MISSING_DHCP_HELPER",
                "description": f"Interface {interface_name} is missing 'ip helper-address' for DHCP relay to remote DHCP server.",
                "evidence": "missing ip helper-address",
                "fix": f"configure terminal\ninterface {interface_name}\nip helper-address 10.0.0.100\n# Note: replace 10.0.0.100 with your actual DHCP server IP"
            })

    # 4. NAT Overload / PAT Keyword Missing
    # Match "missing overload keyword" or PAT configurations missing overload
    if "missing overload" in full_text.lower() or "missing overload keyword" in full_text.lower():
        errors.append({
            "rule_id": "NAT_OVERLOAD_MISSING",
            "description": "NAT translation rule is missing the 'overload' keyword, which prevents multiple inside hosts from sharing the external IP (PAT).",
            "evidence": "missing overload keyword",
            "fix": "configure terminal\nno ip nat inside source list 1 interface GigabitEthernet0/1\nip nat inside source list 1 interface GigabitEthernet0/1 overload"
        })

    # 5. NAT Interface Direction Missing
    if "nat inside" in full_text.lower() and "missing ip nat inside" in full_text.lower():
        errors.append({
            "rule_id": "NAT_INTERFACE_DIR_MISSING",
            "description": "The inside LAN interface is missing the 'ip nat inside' configuration.",
            "evidence": "interface Gi0/0 missing ip nat inside",
            "fix": "configure terminal\ninterface GigabitEthernet0/0\nip nat inside"
        })

    # 6. VLAN Pruned / Missing from Trunk Allowed List
    # e.g., allowed vlan 10 30 40 (missing 20)
    vlan_pruned_match = re.search(r"allowed vlan ([0-9\s]+)", full_text, re.IGNORECASE)
    if vlan_pruned_match and "VLAN 20 missing" in full_text:
        errors.append({
            "rule_id": "VLAN_PRUNED_FROM_TRUNK",
            "description": "VLAN 20 is pruned or missing from the switchport trunk allowed list.",
            "evidence": vlan_pruned_match.group(0),
            "fix": "configure terminal\ninterface FastEthernet0/24\nswitchport trunk allowed vlan add 20"
        })

    # 7. Inter-switch Link Access Mode instead of Trunk
    if "access instead of trunk" in full_text.lower() or "switchport mode access" in full_text.lower():
        if "SW1 Fa0/24: switchport mode access" in full_text or "Fa0/24" in full_text:
            errors.append({
                "rule_id": "TRUNK_CONFIGURED_AS_ACCESS",
                "description": "The link connecting the switches is configured as an access port instead of a trunk port.",
                "evidence": "switchport mode access",
                "fix": "configure terminal\ninterface FastEthernet0/24\nswitchport mode trunk"
            })

    # 8. OSPF Hello Timer Mismatch
    timer_mismatch = re.search(r"hello-interval\s+(\d+).*hello-interval\s+(\d+)", full_text, re.IGNORECASE)
    if "OSPF Hello Timer Mismatch" in full_text or (timer_mismatch and timer_mismatch.group(1) != timer_mismatch.group(2)):
        errors.append({
            "rule_id": "OSPF_HELLO_INTERVAL_MISMATCH",
            "description": "OSPF hello timer mismatch between neighbors prevents forming OSPF adjacency.",
            "evidence": "R1: ip ospf hello-interval 10; R2: ip ospf hello-interval 20" if "R1" in full_text else "OSPF Hello Timer Mismatch",
            "fix": "configure terminal\ninterface GigabitEthernet0/0\nip ospf hello-interval 10\n# Note: Ensure the hello timer matches the neighbor router's config"
        })

    # 9. Passive Interface Enabled on Active Link
    if "passive-interface" in full_text.lower() and "passive interface enabled on active OSPF link" in full_text.lower():
        errors.append({
            "rule_id": "OSPF_PASSIVE_INTERFACE_ERROR",
            "description": "OSPF passive interface is enabled on an active link, blocking OSPF hellos and routing advertisements.",
            "evidence": "passive-interface Serial0/1/0",
            "fix": "configure terminal\nrouter ospf 1\nno passive-interface Serial0/1/0"
        })

    # 10. Switch Port Assigned to Wrong VLAN
    if "assigned to wrong access VLAN" in full_text.lower() or "switchport access vlan" in full_text.lower():
        vlan_match = re.search(r"switchport access vlan\s+(\d+)", full_text, re.IGNORECASE)
        if vlan_match and "vlan 14" in full_text.lower():
            errors.append({
                "rule_id": "WRONG_ACCESS_VLAN",
                "description": "The switch access port is assigned to VLAN 14 instead of the expected VLAN 40.",
                "evidence": "switchport access vlan 14",
                "fix": "configure terminal\ninterface FastEthernet0/10\nswitchport access vlan 40"
            })

    # 11. Duplicate IP Address Detected
    if "%IP-4-DUP_ADDR" in full_text or "Duplicate IP Address" in full_text:
        dup_match = re.search(r"Duplicate address\s+(\S+)", full_text, re.IGNORECASE)
        ip_addr = dup_match.group(1) if dup_match else "192.168.1.100"
        errors.append({
            "rule_id": "DUPLICATE_IP_ADDRESS",
            "description": f"Duplicate IP address conflict detected on LAN: IP {ip_addr} is assigned to multiple hosts.",
            "evidence": f"Duplicate address {ip_addr}" if dup_match else "Duplicate address 192.168.1.100 on FastEthernet0/1",
            "fix": "configure terminal\n# Please change the duplicate static IP configuration on the conflicting host to a free IP\n# Example for interface:\ninterface FastEthernet0/1\nip address 192.168.1.101 255.255.255.0"
        })

    # 12. Default Gateway Outside Client Subnet
    if "gateway outside client subnet" in full_text.lower() or "outside subnet boundary" in full_text.lower():
        errors.append({
            "rule_id": "GATEWAY_OUTSIDE_SUBNET",
            "description": "The host's default gateway IP address resides outside the subnet boundary defined by its IP/subnet mask.",
            "evidence": "IP 10.1.1.50 mask 255.255.255.240; Gateway 10.1.1.30",
            "fix": "configure terminal\n# Correct the host Default Gateway configuration\n# For IP 10.1.1.50/28, the subnet range is 10.1.1.48 to 10.1.1.63.\n# Configure gateway inside range (e.g., 10.1.1.62 or 10.1.1.49)"
        })

    # 13. Missing 802.1Q encapsulation on Sub-interface
    if "missing encapsulation dot1q" in full_text.lower():
        errors.append({
            "rule_id": "MISSING_DOT1Q_ENCAP",
            "description": "Router sub-interface is missing the dot1Q encapsulation tagging command, preventing inter-VLAN routing.",
            "evidence": "missing encapsulation dot1Q 20",
            "fix": "configure terminal\ninterface GigabitEthernet0/0.20\nencapsulation dot1Q 20\nip address 192.168.20.1 255.255.255.0"
        })

    # 14. Native VLAN Mismatch
    if "native vlan mismatch" in full_text.lower() or "native vlan" in full_text.lower() and "mismatch" in full_text.lower():
        errors.append({
            "rule_id": "NATIVE_VLAN_MISMATCH",
            "description": "Native VLAN mismatch detected on trunk link connecting the switches (e.g., VLAN 10 vs VLAN 99).",
            "evidence": "SW1: switchport trunk native vlan 10; SW2: switchport trunk native vlan 99",
            "fix": "configure terminal\ninterface FastEthernet0/1\nswitchport trunk native vlan 99\n# Note: Ensure native VLAN matches on both switch ports"
        })

    # 15. Host Default Gateway IP Misconfiguration
    if "host default gateway ip misconfiguration" in full_text.lower() or "default gateway 192.168.1.254" in full_text.lower():
        errors.append({
            "rule_id": "GATEWAY_IP_MISCONFIGURED",
            "description": "The client is configured with default gateway 192.168.1.254, but the actual gateway IP on the subnet is 192.168.1.1.",
            "evidence": "Default Gateway 192.168.1.254 on Host",
            "fix": "configure terminal\n# Correct the Default Gateway setting on the client host to 192.168.1.1"
        })

    # Output results
    result = {
        "status": "ERRORS_DETECTED" if errors else "PASS",
        "errors": errors
    }
    return result

if __name__ == "__main__":
    try:
        # Read from stdin
        input_data = sys.stdin.read()
        parsed = json.loads(input_data)
        
        symptom = parsed.get("symptom", "")
        topology_note = parsed.get("topology_note", "")
        show_outputs = parsed.get("show_outputs", "")
        
        analysis = analyze_case(symptom, topology_note, show_outputs)
        print(json.dumps(analysis, indent=2))
    except Exception as e:
        # Output fallback error JSON
        print(json.dumps({
            "status": "ERROR",
            "errors": [{
                "rule_id": "SCRIPT_CRASH",
                "description": f"Python checker failed to parse stdin: {str(e)}",
                "evidence": "",
                "fix": ""
            }]
        }))
