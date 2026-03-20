# Node Exporter Metrics (node\_\*)

## CPU

- node_cpu_seconds_total, node_cpu_guest_seconds_total

## Memory (52 metrics)

- Key: node_memory_MemTotal_bytes, node_memory_MemFree_bytes, node_memory_MemAvailable_bytes, node_memory_Cached_bytes, node_memory_Buffers_bytes
- Swap: node_memory_SwapTotal_bytes, node_memory_SwapFree_bytes, node_memory_SwapCached_bytes
- Detailed: Active/Inactive (anon/file), AnonPages, Slab, KernelStack, PageTables, Mapped, Committed_AS, CommitLimit, HugePages, Vmalloc, Shmem, Dirty, Writeback, etc.

## Disk I/O

- node_disk_read_bytes_total, node_disk_written_bytes_total, node_disk_reads_completed_total, node_disk_writes_completed_total, node_disk_read_time_seconds_total, node_disk_write_time_seconds_total, node_disk_io_now, node_disk_io_time_seconds_total, node_disk_io_time_weighted_seconds_total, node_disk_info, discards, flushes, merges

## Filesystem

- node_filesystem_size_bytes, node_filesystem_free_bytes, node_filesystem_avail_bytes, node_filesystem_files, node_filesystem_files_free, node_filesystem_readonly, node_filesystem_device_error

## Network (43 metrics)

- Traffic: node_network_receive_bytes_total, node_network_transmit_bytes_total, node_network_receive_packets_total, node_network_transmit_packets_total
- Errors: receive_errs_total, transmit_errs_total, receive_drop_total, transmit_drop_total
- Interface info: node_network_info, node_network_up, node_network_mtu_bytes, node_network_speed_bytes, node_network_carrier, carrier changes, autonegotiate, etc.

## Load & Scheduling

- node_load1, node_load5, node_load15
- node_context_switches_total, node_forks_total, node_intr_total
- node_procs_running, node_procs_blocked

## PSI (Pressure Stall Information)

- node_pressure_cpu_waiting_seconds_total
- node_pressure_memory_waiting_seconds_total, node_pressure_memory_stalled_seconds_total
- node_pressure_io_waiting_seconds_total, node_pressure_io_stalled_seconds_total

## Conntrack & Sockets

- node_nf_conntrack_entries, node_nf_conntrack_entries_limit
- node*sockstat_TCP*_, node*sockstat_UDP*_, node_sockstat_sockets_used

## System

- node*boot_time_seconds, node_uname_info, node_time_seconds, node_entropy*\*
- node_vmstat_oom_kill, node_vmstat_pgfault, node_vmstat_pgmajfault, node_vmstat_pgpgin/pgpgout, node_vmstat_pswpin/pswpout
- NFS: node_nfs_requests_total, node_nfs_rpcs_total, etc.
- Time sync: node*timex*\* (offset, frequency, PPS, sync status)

# Kubernetes Node State (kube*node*\*)

- kube_node_info, kube_node_created, kube_node_labels, kube_node_role
- kube_node_status_condition (Ready, DiskPressure, MemoryPressure, PIDPressure)
- kube_node_status_capacity, kube_node_status_allocatable (CPU, memory, pods)
- kube_node_spec_taint, kube_node_spec_unschedulable, kube_node_status_addresses

# Kubelet Metrics (kubelet\_\*)

- Pods: kubelet_running_pods, kubelet_running_containers, kubelet_active_pods, kubelet_desired_pods, kubelet_working_pods
- Pod lifecycle: kubelet_pod_start_duration_seconds, kubelet_pod_worker_duration_seconds, kubelet_started_containers_total/errors, kubelet_started_pods_total/errors, kubelet_restarted_pods_total
- Runtime: kubelet_runtime_operations_total, kubelet_runtime_operations_errors_total, kubelet_runtime_operations_duration_seconds
- PLEG: kubelet_pleg_relist_duration_seconds, kubelet_pleg_relist_interval_seconds, kubelet_pleg_last_seen_seconds
- Image pulls: kubelet_image_pull_duration_seconds
- Volumes: kubelet_volume_stats_available_bytes, kubelet_volume_stats_capacity_bytes, kubelet_volume_stats_used_bytes, kubelet_volume_stats_inodes\*
- Evictions: kubelet_evictions, kubelet_eviction_stats_age_seconds
- Cgroups: kubelet_cgroup_manager_duration_seconds, kubelet_cgroup_version
- Certificates: kubelet_certificate_manager_client_ttl_seconds, kubelet_certificate_manager_client_expiration_renew_errors
- HTTP: kubelet_http_requests_total, kubelet_http_requests_duration_seconds
- Other: topology manager, CPU/memory manager pinning, sandbox duration, node startup durations
