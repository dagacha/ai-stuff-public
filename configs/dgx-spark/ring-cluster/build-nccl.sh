#!/bin/bash
# Builds NVIDIA's 3-node-ring NCCL fork + nccl-tests in $HOME (same recipe as the DGX Spark playbook), no sudo.
set -e
export CUDA_HOME=/usr/local/cuda MPI_HOME=/usr/lib/aarch64-linux-gnu/openmpi
export NCCL_HOME=$HOME/nccl_spark_cluster/build
export LD_LIBRARY_PATH=$NCCL_HOME/lib:$CUDA_HOME/lib64:$MPI_HOME/lib:${LD_LIBRARY_PATH:-}
cd ~
[ -d nccl_spark_cluster ] || git clone -q -b dgxspark-3node-ring https://github.com/zyang-dev/nccl.git nccl_spark_cluster
cd nccl_spark_cluster && make -j$(nproc) src.build NVCC_GENCODE="-gencode=arch=compute_121,code=sm_121"
cd ~
[ -d nccl-tests_spark_cluster ] || git clone -q https://github.com/NVIDIA/nccl-tests.git nccl-tests_spark_cluster
cd nccl-tests_spark_cluster && make MPI=1 -j8
echo BUILD_DONE
